import asyncio
import random
import sys
from pathlib import Path

from src.agent import Agent
from src.context_builder import build_decision_user_message, format_transcript_for_log
from src.logger import Logger
import src.flow_logger as fl
import config

# Fix Windows encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')


class Orchestrator:
    def __init__(
        self,
        run_dir: Path,
        simulation: dict | None = None,
        initial_state: dict | None = None,
        runtime_config: dict | None = None,
    ):
        self.run_dir = run_dir
        self.runtime_config = runtime_config or {}
        self.simulation = simulation or self._build_default_simulation()
        self.agent_order = [agent["id"] for agent in self.simulation["agents"]]
        self.agents = {
            agent["id"]: Agent(
                agent["id"],
                context_override={
                    "provider_type": agent.get("provider_type", "openai"),
                    "model_id": agent.get("model_id", config.MODEL),
                    "api_key": agent.get("api_key", config.API_KEY),
                    "identity": agent["identity"],
                    "memory": agent.get("memory", ""),
                    "personas": agent.get("personas", ""),
                    "group_memories": agent.get("group_memories", ""),
                    "protocol": self.simulation["protocol"],
                    "messages": (initial_state or {}).get("agent_states", {}).get(agent["id"], {}).get("messages"),
                    "thought_history": (initial_state or {}).get("agent_states", {}).get(agent["id"], {}).get("thought_history"),
                } if simulation else None,
            )
            for agent in self.simulation["agents"]
        }
        self.logger = Logger(run_dir, self.agent_order)
        self.turn = (initial_state or {}).get("turn", 0)
        self.consecutive_all_hold = (initial_state or {}).get("consecutive_all_hold", 0)
        self.last_spoke = (initial_state or {}).get("last_spoke", {name: 0 for name in self.agent_order})
        self.shared_transcript: list = (initial_state or {}).get("shared_transcript", [])
        # Track consecutive wins ending at the most recent spoken turn.
        # Resets to 0 for everyone except the winner; winner's count increments by 1.
        self.consecutive_wins = (initial_state or {}).get("consecutive_wins", {name: 0 for name in self.agent_order})

    def _cfg(self, key: str, fallback):
        return self.runtime_config.get(key, fallback)

    def _build_default_simulation(self) -> dict:
        provider_type = self.runtime_config.get("default_provider_type", config.DEFAULT_PROVIDER)
        model_id = self.runtime_config.get("default_model_id", config.DEFAULT_MODEL)
        api_key = self.runtime_config.get("default_api_key", config.API_KEY)
        agents = []
        for name in config.AGENTS:
            agent = Agent(name)
            agents.append({
                "id": name,
                "provider_type": provider_type,
                "model_id": model_id,
                "api_key": api_key,
                "identity": agent.identity,
                "memory": agent.memory,
                "personas": agent.personas,
                "group_memories": agent.group_memories,
            })
        with open(Path(config.SHARED_DIR) / "protocol.md", "r", encoding="utf-8") as f:
            protocol = f.read()
        with open(Path(config.SHARED_DIR) / "kickoff.md", "r", encoding="utf-8") as f:
            kickoff = f.read().strip()
        return {"agents": agents, "protocol": protocol, "kickoff": kickoff}

    def serialize_state(self) -> dict:
        return {
            "turn": self.turn,
            "consecutive_all_hold": self.consecutive_all_hold,
            "last_spoke": self.last_spoke,
            "shared_transcript": self.shared_transcript,
            "consecutive_wins": self.consecutive_wins,
            "agent_states": {
                name: {
                    "messages": agent.messages,
                    "thought_history": agent.thought_history,
                }
                for name, agent in self.agents.items()
            },
        }

    def _transcript_since(self, last_turn: int) -> list:
        """Return shared transcript entries strictly after the given turn number."""
        return [e for e in self.shared_transcript if e["turn"] > last_turn]

    def _penalty_multiplier(self, consecutive_wins: int) -> float:
        """Look up penalty multiplier from config, falling back to the highest tier."""
        if not self._cfg("consecutive_speaker_penalty", config.CONSECUTIVE_SPEAKER_PENALTY):
            return 1.0
        raw_table = self._cfg("consecutive_penalty_multipliers", config.CONSECUTIVE_PENALTY_MULTIPLIERS)
        table = {int(key): float(value) for key, value in raw_table.items()}
        if consecutive_wins in table:
            return table[consecutive_wins]
        # Fall back to the highest defined tier for any value above the table
        max_key = max(table.keys())
        return table[max_key] if consecutive_wins > max_key else 1.0

    def _apply_penalty(self, name: str, raw_urgency: float) -> dict:
        """
        Compute effective urgency for floor selection, plus metadata for UI/logs.
        Returns: {"effective_urgency", "penalty_multiplier", "penalty_delta",
                  "consecutive_wins_before", "penalty_reason"}.
        """
        wins_before = self.consecutive_wins[name]
        multiplier = self._penalty_multiplier(wins_before)
        effective = round(raw_urgency * multiplier, 2)
        delta = round(effective - raw_urgency, 2)

        if multiplier == 1.0 or wins_before == 0:
            reason = ""
        elif wins_before == 1:
            reason = "won previous turn"
        else:
            reason = f"won {wins_before} turns in a row"

        return {
            "effective_urgency": effective,
            "penalty_multiplier": multiplier,
            "penalty_delta": delta,
            "consecutive_wins_before": wins_before,
            "penalty_reason": reason,
        }

    async def bootstrap(self) -> None:
        """Load kickoff message, append to all agents, and seed shared transcript."""
        if self.shared_transcript:
            fl.ok("bootstrap skipped: existing state loaded")
            return
        fl.step("bootstrap: loading kickoff")
        kickoff = self.simulation["kickoff"]
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

    async def run_turn(self) -> dict:
        """
        Execute one sequential-floor turn.

        Phase 1 (parallel): all agents emit {decision, inner_thought, [urgency]}.
        Phase 2 (single):   highest-urgency winner generates the spoken message.
        """
        self.turn += 1
        print(f"\n--- Turn {self.turn} ---")
        fl.step(f"turn {self.turn}: start")

        # ----- PHASE 1: DECISION -----
        fl.step(f"turn {self.turn}: phase 1 — building decision messages")
        for name in self.agent_order:
            agent = self.agents[name]
            you_last = (
                f"turn {self.last_spoke[name]}"
                if self.last_spoke[name] > 0
                else "not yet this conversation"
            )
            transcript_slice = self._transcript_since(self.last_spoke[name])
            decision_msg = build_decision_user_message(
                turn_num=self.turn,
                agent_name=name,
                you_last_spoke=you_last,
                transcript_since_last_turn=transcript_slice,
                thought_history=agent.thought_history,
            )
            fl.info(f"{name}: transcript_slice_len", len(transcript_slice))
            fl.info(f"{name}: thought_history_len", len(agent.thought_history))
            fl.info(f"{name}: decision_msg_preview", decision_msg[:200])
            agent.messages.append({"role": "user", "content": decision_msg})
            fl.agent_messages_state(name, agent.messages)

        # Parallel decision calls — each appends exactly one assistant message
        fl.step(f"turn {self.turn}: phase 1 — calling APIs in parallel")
        decision_results = await asyncio.gather(
            *[self.agents[name].call_decision() for name in self.agent_order]
        )
        decisions = {r["name"]: r for r in decision_results}

        # Apply consecutive-speaker penalty to every decision (SPEAK + HOLD).
        # This is purely mechanical — LLMs never see urgency, raw or effective.
        for name, d in decisions.items():
            penalty_info = self._apply_penalty(name, d["urgency"])
            d.update(penalty_info)
            # Mirror inner_thought → reason for frontend backward-compat
            d["reason"] = d["inner_thought"]

        # Log decisions (Phase 1 results, never enters agent LLM context)
        self.logger.log_decisions(self.turn, {
            n: {
                "decision": d["decision"],
                "urgency": d["urgency"],
                "effective_urgency": d["effective_urgency"],
                "penalty_multiplier": d["penalty_multiplier"],
                "penalty_reason": d["penalty_reason"],
                "consecutive_wins_before": d["consecutive_wins_before"],
                "inner_thought": d["inner_thought"],
                "reason": d["inner_thought"],
            }
            for n, d in decisions.items()
        })

        # Print and flow-log decision summary
        for name in self.agent_order:
            d = decisions[name]
            fl.decision(self.turn, name, d["decision"], d["urgency"], d.get("inner_thought", ""))
            fl.info(f"{name}: raw_output", d.get("raw_output", "")[:300])
            if d["decision"] == "SPEAK":
                penalty_note = (
                    f" [eff {d['effective_urgency']:.2f}, {d['penalty_reason']}]"
                    if d["penalty_multiplier"] != 1.0
                    else ""
                )
                print(f"  {name}: SPEAK (urgency={d['urgency']:.2f}{penalty_note}) — thought: {d['inner_thought']}")
            else:
                print(f"  {name}: HOLD — thought: {d['inner_thought']}")

        # ----- FLOOR SELECTION (no fuzzy threshold) -----
        speakers = {
            name: d for name, d in decisions.items()
            if d["decision"] == "SPEAK"
        }

        # Record every agent's thought from this turn (Option A: spoke or held)
        # We'll override `spoke` for the winner after floor is picked.

        if not speakers:
            # All HOLD — record thoughts, reset consecutive wins, possibly terminate
            for name in self.agent_order:
                self.agents[name].record_thought(
                    turn=self.turn,
                    spoke=False,
                    thought=decisions[name].get("inner_thought", ""),
                )
                self.consecutive_wins[name] = 0

            self.consecutive_all_hold += 1
            fl.warn(f"turn {self.turn}: ALL HOLD (consecutive={self.consecutive_all_hold})")
            formatted = format_transcript_for_log(self.turn, None, None, decisions, self.agent_order)
            self.logger.log_turn(self.turn, formatted)
            for name in self.agent_order:
                self.logger.log_api_call(name, self.turn, {"phase": "decision"}, decisions[name])
            self.logger.write_files()
            print("  All agents HOLD.")
            turn_data = {
                "turn": self.turn,
                "winner": None,
                "message": "",
                "decisions": decisions
            }
            if self.consecutive_all_hold >= self._cfg("all_hold_termination", config.ALL_HOLD_TERMINATION):
                print(f"  Terminated: {self.consecutive_all_hold} consecutive all-HOLD turns.")
                return {"continue": False, "data": turn_data}
            return {"continue": self.turn < self._cfg("max_turns", config.MAX_TURNS), "data": turn_data}

        self.consecutive_all_hold = 0

        # Pick winner: strict highest EFFECTIVE urgency (after penalty).
        # Random tie-break ONLY among exact ties on effective urgency.
        max_eff = max(d["effective_urgency"] for d in speakers.values())
        top = [(n, d) for n, d in speakers.items() if d["effective_urgency"] == max_eff]
        winner_name, winner_decision = random.choice(top) if len(top) > 1 else top[0]
        fl.floor(self.turn, winner_name, winner_decision["effective_urgency"], list(speakers.keys()))

        # Update consecutive-wins tracker: winner +1, everyone else resets to 0
        for name in self.agent_order:
            if name == winner_name:
                self.consecutive_wins[name] += 1
            else:
                self.consecutive_wins[name] = 0

        # Record thoughts for everyone (Option A — winner=spoke, others=held)
        for name in self.agent_order:
            self.agents[name].record_thought(
                turn=self.turn,
                spoke=(name == winner_name),
                thought=decisions[name].get("inner_thought", ""),
            )

        # ----- PHASE 2: WINNER GENERATES RESPONSE -----
        fl.step(f"turn {self.turn}: phase 2 — {winner_name} generating response")
        winner_agent = self.agents[winner_name]
        response_data = await winner_agent.call_response(winner_decision["inner_thought"])
        winner_message = response_data["response"]
        fl.message(self.turn, winner_name, winner_message)
        fl.info(f"{winner_name}: raw_response_output", response_data.get("raw_output", "")[:300])

        # Update state
        self.last_spoke[winner_name] = self.turn
        self.shared_transcript.append({
            "turn": self.turn,
            "speaker": winner_name.capitalize(),
            "message": winner_message
        })

        # Log and print transcript entry
        formatted = format_transcript_for_log(self.turn, winner_name, winner_message, decisions, self.agent_order)
        self.logger.log_turn(self.turn, formatted)
        print(formatted)

        # Log API calls for debugging
        for name in self.agent_order:
            self.logger.log_api_call(name, self.turn, {"phase": "decision"}, decisions[name])
        self.logger.log_api_call(winner_name, self.turn, {"phase": "response"}, response_data)

        # Persist after every turn so runs/<timestamp>/ stays up-to-date
        # (works for both CLI and server-driven turn-by-turn execution)
        self.logger.write_files()

        turn_data = {
            "turn": self.turn,
            "winner": winner_name,
            "message": winner_message,
            "decisions": decisions
        }

        return {"continue": self.turn < self._cfg("max_turns", config.MAX_TURNS), "data": turn_data}

    async def run(self) -> None:
        """Run the full conversation loop."""
        print("Initializing conversation...")
        await self.bootstrap()

        while True:
            result = await self.run_turn()
            if not result["continue"]:
                break

        print("\n--- Conversation Complete ---")
        print(f"Total turns: {self.turn}")
        print(f"Writing logs to {self.run_dir}...")
        self.logger.write_files()
        print("Done.")
