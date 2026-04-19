import json
from typing import Dict, List, Optional


def build_decision_user_message(
    turn_num: int,
    agent_name: str,
    you_last_spoke: str,
    transcript_since_last_turn: list,
    held_thoughts: list,
    repetition_count: int = 0,
    memory_trigger: Optional[str] = None,
) -> str:
    """
    Builds the Phase 1 user message — the decision prompt context.

    transcript_since_last_turn: list of {"turn": int, "speaker": str, "message": str}
    held_thoughts: list of "turn N: reason" strings from this agent's prior losses
    """
    # On early turns with no conversation yet, nudge agents to open
    is_opener = len([e for e in transcript_since_last_turn if e.get("speaker") != "Narrator"]) == 0
    opener_note = " The conversation has just started — someone needs to open. If you have a strong opinion, claim the floor." if is_opener else ""

    payload = {
        "turn": turn_num,
        "you_last_spoke": you_last_spoke,
        "transcript_since_your_last_turn": transcript_since_last_turn,
        "your_held_thoughts": held_thoughts,
        "times_you_made_similar_point_recently": repetition_count,
        "instruction": (
            f"You are {agent_name.capitalize()}. "
            "Decide: HOLD, or SPEAK with urgency (0-10 precise float, 2 decimals) and 1-2 line reason. "
            "Urgency must reflect your exact conviction — use precise values like 6.73 or 8.41, never round numbers like 7.0 or 8.5. "
            "Reply with a single raw JSON object starting with { and ending with }. "
            f"No markdown, no code fences, no extra text.{opener_note}"
        ),
    }
    if memory_trigger:
        payload["memory_reminder"] = memory_trigger
    return json.dumps(payload, ensure_ascii=False)


def format_transcript_for_log(
    turn_num: int,
    winner: Optional[str],
    winner_message: Optional[str],
    decisions: Dict[str, dict],
    agent_order: List[str],
) -> str:
    """
    Format a single-speaker turn for the human-readable transcript.

    winner: agent name who spoke, or None if all HOLD
    winner_message: the message text, or None
    decisions: full decisions dict including losers' reasons
    """
    lines = [f"[Turn {turn_num}]"]

    if winner is None:
        lines.append("  (all held)")
    else:
        lines.append(f"  Speaker: {winner.capitalize()}")
        lines.append(f"  Message: {winner_message}")
        # Show losers' held intents for human review (not in any agent's LLM context)
        for agent in agent_order:
            if agent == winner:
                continue
            d = decisions.get(agent, {})
            if d.get("decision") == "SPEAK":
                lines.append(f"  (held) {agent.capitalize()} wanted: {d.get('reason', '')}")
            else:
                lines.append(f"  (held) {agent.capitalize()}: HOLD")

    return "\n".join(lines)
