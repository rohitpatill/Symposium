import json
from pathlib import Path
from typing import Optional
import config
from src.providers import get_provider


class Agent:
    def __init__(self, name: str, context_override: Optional[dict] = None):
        self.name = name
        self.agent_dir = Path(config.AGENTS_DIR) / name
        self.context_override = context_override or {}

        if self.context_override:
            self.provider_type = self.context_override.get("provider_type", config.DEFAULT_PROVIDER)
            self.model_id = self.context_override.get("model_id", config.DEFAULT_MODEL)
            self.api_key = self.context_override.get("api_key", config.API_KEY)
            self.identity = self.context_override.get("identity", "")
            self.memory = self.context_override.get("memory", "")
            self.personas = self.context_override.get("personas", "")
            self.group_memories = self.context_override.get("group_memories", "")
            self.protocol = self.context_override.get("protocol", "")
        else:
            self.provider_type = config.DEFAULT_PROVIDER
            self.model_id = config.DEFAULT_MODEL
            self.api_key = config.API_KEY
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
        initial_messages = self.context_override.get("messages")
        self.messages = initial_messages if initial_messages else [{"role": "system", "content": self.system_prompt}]

        # Thought history: this agent's last N inner thoughts (whether they spoke or held)
        # Each entry: {"turn": int, "spoke": bool, "thought": str}
        initial_thought_history = self.context_override.get("thought_history")
        self.thought_history: list = initial_thought_history if initial_thought_history is not None else []

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

    def _post(self, max_tokens: int) -> dict:
        provider = get_provider(self.provider_type)
        return provider.generate_json(
            api_key=self.api_key,
            model=self.model_id,
            system_prompt=self.system_prompt,
            messages=[message for message in self.messages if message["role"] != "system"],
            max_tokens=max_tokens,
            cache_key=f"{self.provider_type}:{self.model_id}:{self.name}",
            cache_options={"retention": "in_memory"},
        )

    async def call_decision(self) -> dict:
        """
        Phase 1 call. Orchestrator has already appended the decision user message.
        Returns parsed decision dict:
          {"decision": "HOLD", "inner_thought": str} or
          {"decision": "SPEAK", "urgency": float, "inner_thought": str}
        Appends exactly one assistant message.
        """
        data = self._post(max_tokens=config.DECISION_MAX_TOKENS)
        decision_text = data["text"]

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
        response_text = data["text"]

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
