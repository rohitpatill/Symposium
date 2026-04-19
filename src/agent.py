import json
import requests
from pathlib import Path
from typing import Optional
import config


class Agent:
    def __init__(self, name: str):
        self.name = name
        self.agent_dir = Path(config.AGENTS_DIR) / name

        # Load static files
        self.identity = self._load_file("identity.md")
        self.memory = self._load_file("memory.md")
        self.personas = self._load_file("personas.md")

        # Load shared files
        self.group_memories = self._load_group_memories()
        self.protocol = self._load_file(Path(config.SHARED_DIR) / "protocol.md")

        # Build system prompt (done once, never changes)
        self.system_prompt = self._build_system_prompt()

        # Message array (grows each turn)
        self.messages = [
            {"role": "system", "content": self.system_prompt}
        ]

        # Held thoughts: reasons this agent wanted to speak but lost the floor
        self.held_thoughts: list = []

    def _load_file(self, filename) -> str:
        if isinstance(filename, Path):
            path = filename
        else:
            path = self.agent_dir / filename
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def _load_group_memories(self) -> str:
        path = Path(config.SHARED_DIR) / "group_memories.md"
        with open(path, "r", encoding="utf-8") as f:
            full_content = f.read()

        lines = full_content.split("\n")
        filtered_lines = []
        include_section = False

        for line in lines:
            if line.startswith("## All Three"):
                include_section = True
            elif line.startswith("## "):
                include_section = self.name in line.lower()
            if include_section:
                filtered_lines.append(line)

        return "\n".join(filtered_lines)

    def _build_system_prompt(self) -> str:
        return f"""{self.identity}

## How You See Others

{self.personas}

## Your Memories

{self.memory}

## Group Context

{self.group_memories}

## Protocol

{self.protocol}
"""

    def append_user_message(self, content: str) -> None:
        self.messages.append({"role": "user", "content": content})

    def append_assistant_message(self, content: str) -> None:
        self.messages.append({"role": "assistant", "content": content})

    def add_held_thought(self, turn: int, reason: str) -> None:
        """Called by orchestrator when this agent claimed SPEAK but lost the floor."""
        self.held_thoughts.append(f"turn {turn}: {reason}")
        if len(self.held_thoughts) > config.MAX_HELD_THOUGHTS:
            self.held_thoughts.pop(0)

    def clear_held_thoughts(self) -> None:
        """Called after this agent wins and speaks."""
        self.held_thoughts = []

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
        Returns parsed decision dict: {"decision": "HOLD"} or
        {"decision": "SPEAK", "urgency": float, "reason": str}
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
            result = {"decision": "HOLD"}

        return {
            "name": self.name,
            "decision": result.get("decision", "HOLD"),
            "urgency": float(result.get("urgency", 0)),
            "reason": result.get("reason", ""),
            "raw_output": decision_text,
            "usage": data.get("usage", {})
        }

    async def call_response(self, intent: str) -> dict:
        """
        Phase 2 call. Only invoked on the winning agent.
        Appends exactly one user message (intent injection) then exactly one assistant message.
        Returns parsed {"response": "..."}.
        """
        intent_msg = json.dumps({
            "instruction": "You won the floor. Generate your actual message now. Reply with a single raw JSON object starting with { and ending with }. No markdown, no code fences, no extra text.",
            "your_intent": intent,
            "format": '{"response": "your message here"}'
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
