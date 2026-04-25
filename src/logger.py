import json
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime


class Logger:
    def __init__(self, run_dir: Path, agent_names: List[str]):
        self.run_dir = run_dir
        self.agent_names = agent_names

        self.agent_logs = {name: [] for name in agent_names}
        self.transcript_lines = []
        self.raw_calls = []
        self.decision_log = []  # Phase 1 decisions per turn

    def log_api_call(self, agent_name: str, turn_num: int, payload: Dict, response: Dict) -> None:
        call_record = {
            "timestamp": datetime.now().isoformat(),
            "agent": agent_name,
            "turn": turn_num,
            "payload": payload,
            "response": response
        }
        self.agent_logs[agent_name].append(call_record)
        self.raw_calls.append(call_record)

    def log_decisions(self, turn_num: int, decisions: dict) -> None:
        """Log phase-1 decisions including losers' reasons (never enters agent LLM context)."""
        self.decision_log.append({
            "turn": turn_num,
            "decisions": decisions
        })

    def log_turn(self, turn_num: int, formatted: str) -> None:
        self.transcript_lines.append(formatted)

    def write_files(self) -> None:
        """
        Write all logs to disk. Safe to call repeatedly — each call rewrites
        from current in-memory state. Called after every turn so the runs/
        folder is always up-to-date (works for both CLI and server modes).
        """
        # Per-agent logs
        for agent_name in self.agent_names:
            log_path = self.run_dir / f"{agent_name}.log"
            with open(log_path, "w", encoding="utf-8") as f:
                f.write(f"# {agent_name.upper()} — API Call Log\n\n")
                for call in self.agent_logs[agent_name]:
                    f.write(f"## Turn {call['turn']}\n")
                    f.write(f"**Time:** {call['timestamp']}\n\n")
                    f.write("### Request\n```json\n")
                    f.write(json.dumps(call['payload'], indent=2, ensure_ascii=False))
                    f.write("\n```\n\n")
                    f.write("### Response\n```json\n")
                    f.write(json.dumps(call['response'], indent=2, ensure_ascii=False))
                    f.write("\n```\n\n")

        # Transcript (human-readable, scenario-agnostic header)
        transcript_path = self.run_dir / "transcript.md"
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write("# Conversation Transcript\n\n")
            f.write(f"Agents: {', '.join(name.capitalize() for name in self.agent_names)}\n\n")
            f.write("---\n\n")
            f.write("\n\n".join(self.transcript_lines))

        # Decisions log (JSONL — one line per turn, includes losers' thoughts + penalty info)
        decisions_path = self.run_dir / "decisions.jsonl"
        with open(decisions_path, "w", encoding="utf-8") as f:
            for entry in self.decision_log:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # Raw calls (JSONL for replay)
        raw_path = self.run_dir / "raw.jsonl"
        with open(raw_path, "w", encoding="utf-8") as f:
            for call in self.raw_calls:
                f.write(json.dumps(call, ensure_ascii=False) + "\n")
