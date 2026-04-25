import json
import requests
from pathlib import Path
from typing import Optional
import config


class Agent:
    def __init__(self, name: str):
        self.name = name
        self.agent_dir = Path(config.AGENTS_DIR) / name

        # Load static files (memory and personas are optional per scenario)
        self.identity = self._load_file("identity.md")
        self.memory = self._load_optional("memory.md")
        self.personas = self._load_optional("personas.md")

        # Load shared files
        self.group_memories = self._load_group_memories()
        self.protocol = self._load_file(Path(config.SHARED_DIR) / "protocol.md")

        # Build system prompt (done once, never changes)
        self.system_prompt = self._build_system_prompt()

        # Message array (grows each turn)
        self.messages = [
            {"role": "system", "content": self.system_prompt}
        ]

        # Thought history: this agent's last N inner thoughts (whether they spoke or held)
        # Each entry: {"turn": int, "spoke": bool, "thought": str}
        self.thought_history: list = []

    def _load_file(self, filename) -> str:
        if isinstance(filename, Path):
            path = filename
        else:
            path = self.agent_dir / filename
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def _load_optional(self, filename: str) -> str:
        """Load a file if it exists; return empty string otherwise."""
        path = self.agent_dir / filename
        if not path.exists():
            return ""
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def _load_group_memories(self) -> str:
        """
        Return group memories visible to this agent.

        Filtering rules:
        - Top-level content (before any `## ` subsection) is always included.
        - A `## ` subsection is included if it contains this agent's name (case-insensitive)
          OR if it represents an "all" / "everyone" section.
        - Otherwise the subsection is excluded (e.g. pair memories this agent isn't in).
        """
        path = Path(config.SHARED_DIR) / "group_memories.md"
        if not path.exists():
            return ""

        with open(path, "r", encoding="utf-8") as f:
            full_content = f.read()

        lines = full_content.split("\n")
        filtered_lines = []
        include_section = True  # top-level content included by default
        name_lower = self.name.lower()
        all_markers = {"all", "everyone", "shared", "group"}

        for line in lines:
            if line.startswith("## "):
                heading = line[3:].lower()
                # Include if heading mentions this agent OR signals an "all" section
                include_section = (
                    name_lower in heading
                    or any(m in heading for m in all_markers)
                )
            if include_section:
                filtered_lines.append(line)

        return "\n".join(filtered_lines)

    def _build_system_prompt(self) -> str:
        sections = [self.identity.strip()]
        if self.personas.strip():
            sections.append("## How You See Others\n\n" + self.personas.strip())
        if self.memory.strip():
            sections.append("## Your Memories\n\n" + self.memory.strip())
        if self.group_memories.strip():
            sections.append("## Group Context\n\n" + self.group_memories.strip())
        sections.append("## Protocol\n\n" + self.protocol.strip())
        return "\n\n".join(sections) + "\n"

    def append_user_message(self, content: str) -> None:
        self.messages.append({"role": "user", "content": content})

    def append_assistant_message(self, content: str) -> None:
        self.messages.append({"role": "assistant", "content": content})

    def record_thought(self, turn: int, spoke: bool, thought: str) -> None:
        """Record this agent's inner thought from this turn (whether they spoke or held)."""
        if not thought:
            return
        self.thought_history.append({"turn": turn, "spoke": spoke, "thought": thought})
        if len(self.thought_history) > config.MAX_THOUGHT_HISTORY:
            self.thought_history.pop(0)

    def _build_input_list(self) -> list:
        """Convert self.messages to /v1/responses input format."""
        input_list = []
        for msg in self.messages:
            if msg["role"] == "system":
                input_list.append({
                    "role": "user",
                    "content": [{"type": "input_text", "text": msg["content"]}]
                })
            elif msg["role"] == "user":
                input_list.append({
                    "role": "user",
                    "content": [{"type": "input_text", "text": msg["content"]}]
                })
            elif msg["role"] == "assistant":
                input_list.append({
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": msg["content"]}]
                })
        return input_list

    def _post(self, max_tokens: int) -> dict:
        """Make the actual HTTP request to OpenAI API."""
        payload = {
            "model": config.MODEL,
            "input": self._build_input_list(),
            "max_output_tokens": max_tokens,
            "text": {"format": {"type": "json_object"}}
        }
        safe_api_key = config.API_KEY.replace('\u2011', '-').replace('\u2010', '-').replace('\u2212', '-')
        headers = {
            "Authorization": safe_api_key,
            "Content-Type": "application/json"
        }
        response = requests.post(config.API_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()

    def _extract_text(self, api_response: dict) -> str:
        """Extract response text from API response."""
        return api_response["output"][0]["content"][0]["text"]

    async def call_decision(self) -> dict:
        """
        Phase 1 call. Orchestrator has already appended the decision user message.
        Returns parsed decision dict:
          {"decision": "HOLD", "inner_thought": str} or
          {"decision": "SPEAK", "urgency": float, "inner_thought": str}
        Appends exactly one assistant message.
        """
        data = self._post(max_tokens=config.DECISION_MAX_TOKENS)
        decision_text = self._extract_text(data)

        # Append assistant message (invariant: exactly one)
        self.messages.append({"role": "assistant", "content": decision_text})

        try:
            clean = decision_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            result = json.loads(clean)
        except json.JSONDecodeError:
            result = {"decision": "HOLD", "inner_thought": ""}

        # Backward-compat: accept "reason" if model still uses old key
        inner_thought = result.get("inner_thought", result.get("reason", ""))

        return {
            "name": self.name,
            "decision": result.get("decision", "HOLD"),
            "urgency": float(result.get("urgency", 0)),
            "inner_thought": inner_thought,
            "raw_output": decision_text,
            "usage": data.get("usage", {})
        }

    async def call_response(self, inner_thought: str) -> dict:
        """
        Phase 2 call. Only invoked on the winning agent.
        Appends exactly one user message (intent injection) then exactly one assistant message.
        Returns parsed {"response": "..."}.
        """
        intent_msg = json.dumps({
            "instruction": (
                "You won the floor. Now generate the actual MESSAGE you say out loud to the group, "
                "based on your inner thought below. Speak in character — do NOT just paraphrase the inner thought. "
                "Inner thought is private; the response is what others hear. "
                "Reply with a single raw JSON object starting with { and ending with }. "
                "No markdown, no code fences, no extra text."
            ),
            "your_inner_thought": inner_thought,
            "format": '{"response": "what you say out loud to the group"}'
        }, ensure_ascii=False)

        # Append intent injection user message (invariant: exactly one)
        self.messages.append({"role": "user", "content": intent_msg})

        data = self._post(max_tokens=config.RESPONSE_MAX_TOKENS)
        response_text = self._extract_text(data)

        # Append assistant message (invariant: exactly one)
        self.messages.append({"role": "assistant", "content": response_text})

        try:
            clean = response_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            result = json.loads(clean)
            response_str = result.get("response", "")
        except json.JSONDecodeError:
            response_str = response_text

        return {
            "name": self.name,
            "response": response_str,
            "raw_output": response_text,
            "usage": data.get("usage", {})
        }
