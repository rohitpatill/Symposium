import asyncio
import json
import random
import sys
from pathlib import Path
from typing import Optional

from src.agent import Agent
from src.context_builder import build_decision_user_message, format_transcript_for_log
from src.logger import Logger
import src.flow_logger as fl
import config

# Fix Windows encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')


class Orchestrator:
    def __init__(self, run_dir: Path):
        self.run_dir = run_dir
        self.agents = {name: Agent(name) for name in config.AGENTS}
        self.logger = Logger(run_dir, config.AGENTS)
        self.turn = 0
        self.consecutive_all_hold = 0
        self.last_spoke = {name: 0 for name in config.AGENTS}
        self.shared_transcript: list = []  # [{"turn": N, "speaker": str, "message": str}]
        self.agent_speech_history: dict = {name: [] for name in config.AGENTS}

    def _count_similar_recent_points(self, agent_name: str) -> int:
        history = self.agent_speech_history[agent_name]
        if not history:
            return 0
        theme_keywords = {
            "aarav": ["himachal", "trek", "adventure", "thrill", "mountain", "hike", "epic", "adrenaline", "peaks", "views"],
            "priya": ["safety", "comfort", "manali", "food poisoning", "risk", "safe", "planned", "predictable", "health"],
            "kabir": ["food", "seafood", "goa", "meal", "cuisine", "eat", "restaurant", "quality", "taste", "cook"],
        }
        keywords = theme_keywords.get(agent_name, [])
        count = 0
        for msg in history:
            lower = msg.lower()
            if sum(1 for k in keywords if k in lower) >= 2:
                count += 1
        return count

    def _memory_trigger_for(self, name: str, turn: int) -> Optional[str]:
        """Return memory trigger for agent starting from turn 3."""
        if turn < 3:
            return None
        triggers = {
            "aarav": "Remember: you secretly got food poisoning in Manali but didn't tell Priya",
            "priya": "Remember: you got food poisoning in Manali from a dhaba and you never want that again",
            "kabir": "Remember: you hate Manali food, you prefer Goa seafood"
        }
        return triggers.get(name)

    def _transcript_since(self, last_turn: int) -> list:
        """Return shared transcript entries after the given turn number."""
        return [e for e in self.shared_transcript if e["turn"] > last_turn]

    async def bootstrap(self) -> None:
        """Load kickoff message, append to all agents, and seed shared transcript."""
        fl.step("bootstrap: loading kickoff")
        with open(Path(config.SHARED_DIR) / "kickoff.md", "r", encoding="utf-8") as f:
            kickoff = f.read().strip()
        fl.info("kickoff_length", len(kickoff))
        for agent in self.agents.values():
            agent.append_user_message(kickoff)
            fl.agent_messages_state(agent.name, agent.messages)
        # Seed shared transcript so turn 1 agents see this as context
        self.shared_transcript.append({
            "turn": 0,
            "speaker": "Narrator",
            "message": kickoff
        })
        fl.ok("bootstrap complete")

    async def run_turn(self) -> bool:
        """
        Execute one sequential-floor turn.

        Phase 1 (parallel): all agents decide HOLD or SPEAK with urgency.
        Phase 2 (single): highest urgency winner generates actual message.

        Returns True to continue, False to terminate.
        """
        self.turn += 1
        print(f"\n--- Turn {self.turn} ---")
        fl.step(f"turn {self.turn}: start")

        # ----- PHASE 1: DECISION -----
        fl.step(f"turn {self.turn}: phase 1 — building decision messages")
        for name in config.AGENTS:
            agent = self.agents[name]
            you_last = f"turn {self.last_spoke[name]}" if self.last_spoke[name] > 0 else "not yet this conversation"
            transcript_slice = self._transcript_since(self.last_spoke[name])
            repetition_count = self._count_similar_recent_points(name)
            decision_msg = build_decision_user_message(
                turn_num=self.turn,
                agent_name=name,
                you_last_spoke=you_last,
                transcript_since_last_turn=transcript_slice,
                held_thoughts=agent.held_thoughts,
                repetition_count=repetition_count,
                memory_trigger=self._memory_trigger_for(name, self.turn),
            )
            fl.info(f"{name}: transcript_slice_len", len(transcript_slice))
            fl.info(f"{name}: repetition_count", repetition_count)
            fl.info(f"{name}: held_thoughts", agent.held_thoughts)
            fl.info(f"{name}: decision_msg_preview", decision_msg[:200])
            agent.messages.append({"role": "user", "content": decision_msg})
            fl.agent_messages_state(name, agent.messages)

        # Parallel decision calls — each appends exactly one assistant message
        fl.step(f"turn {self.turn}: phase 1 — calling APIs in parallel")
        decision_results = await asyncio.gather(
            *[self.agents[name].call_decision() for name in config.AGENTS]
        )
        decisions = {r["name"]: r for r in decision_results}

        # Log decisions (Phase 1 results, never enters agent LLM context)
        self.logger.log_decisions(self.turn, {
            n: {"decision": d["decision"], "urgency": d["urgency"], "reason": d["reason"]}
            for n, d in decisions.items()
        })

        # Print and flow-log decision summary
        for name in config.AGENTS:
            d = decisions[name]
            fl.decision(self.turn, name, d["decision"], d["urgency"], d.get("reason", ""))
            fl.info(f"{name}: raw_output", d.get("raw_output", "")[:300])
            if d["decision"] == "SPEAK":
                print(f"  {name}: SPEAK (urgency={d['urgency']:.2f}) — {d['reason']}")
            else:
                print(f"  {name}: HOLD")

        # ----- FLOOR SELECTION -----
        speakers = {
            name: d for name, d in decisions.items()
            if d["decision"] == "SPEAK"
        }

        if not speakers:
            # All HOLD
            self.consecutive_all_hold += 1
            fl.warn(f"turn {self.turn}: ALL HOLD (consecutive={self.consecutive_all_hold})")
            formatted = format_transcript_for_log(self.turn, None, None, decisions, config.AGENTS)
            self.logger.log_turn(self.turn, formatted)
            print("  All agents HOLD.")
            if self.consecutive_all_hold >= config.CONSECUTIVE_HOLDS_TO_STOP:
                print(f"  Terminated: {self.consecutive_all_hold} consecutive all-HOLD turns.")
                return False
            return self.turn < config.MAX_TURNS

        self.consecutive_all_hold = 0

        # Pick winner: highest urgency, tie-break random within threshold
        sorted_speakers = sorted(speakers.items(), key=lambda kv: kv[1]["urgency"], reverse=True)
        top_urgency = sorted_speakers[0][1]["urgency"]
        tied = [(n, d) for n, d in sorted_speakers if top_urgency - d["urgency"] <= config.URGENCY_TIE_THRESHOLD]
        winner_name, winner_decision = random.choice(tied)
        fl.floor(self.turn, winner_name, winner_decision["urgency"], list(speakers.keys()))

        # Losers: store their reasons as held thoughts (private, never shared)
        for name, d in speakers.items():
            if name != winner_name:
                self.agents[name].add_held_thought(self.turn, d["reason"])

        # ----- PHASE 2: WINNER GENERATES RESPONSE -----
        fl.step(f"turn {self.turn}: phase 2 — {winner_name} generating response")
        winner_agent = self.agents[winner_name]
        response_data = await winner_agent.call_response(winner_decision["reason"])
        winner_message = response_data["response"]
        fl.message(self.turn, winner_name, winner_message)
        fl.info(f"{winner_name}: raw_response_output", response_data.get("raw_output", "")[:300])

        # Winner's held thoughts reset
        winner_agent.clear_held_thoughts()

        # Update speech history for repetition tracking
        self.agent_speech_history[winner_name].append(winner_message)
        if len(self.agent_speech_history[winner_name]) > 5:
            self.agent_speech_history[winner_name].pop(0)

        # Update state
        self.last_spoke[winner_name] = self.turn
        self.shared_transcript.append({
            "turn": self.turn,
            "speaker": winner_name.capitalize(),
            "message": winner_message
        })

        # Log and print transcript entry
        formatted = format_transcript_for_log(self.turn, winner_name, winner_message, decisions, config.AGENTS)
        self.logger.log_turn(self.turn, formatted)
        print(formatted)

        # Log API calls for debugging
        for name in config.AGENTS:
            self.logger.log_api_call(name, self.turn, {"phase": "decision"}, decisions[name])
        self.logger.log_api_call(winner_name, self.turn, {"phase": "response"}, response_data)

        return self.turn < config.MAX_TURNS

    async def run(self) -> None:
        """Run the full conversation loop."""
        print("Initializing conversation...")
        await self.bootstrap()

        while True:
            should_continue = await self.run_turn()
            if not should_continue:
                break

        print("\n--- Conversation Complete ---")
        print(f"Total turns: {self.turn}")
        print(f"Writing logs to {self.run_dir}...")
        self.logger.write_files()
        print("Done.")
