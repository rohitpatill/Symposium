import json
from typing import Dict, List, Optional


def build_decision_user_message(
    turn_num: int,
    agent_name: str,
    you_last_spoke: str,
    transcript_since_last_turn: list,
    thought_history: list,
) -> str:
    """
    Phase 1 prompt — asks the agent for a private inner thought + decision.

    transcript_since_last_turn: list of {"turn": int, "speaker": str, "message": str}
        — what others said (and you said) since this agent last spoke.
    thought_history: this agent's OWN last N inner thoughts, list of
        {"turn": int, "spoke": bool, "thought": str}
        — private to this agent, never shared with others.
    """

    is_opener = len([e for e in transcript_since_last_turn if e.get("speaker") != "Narrator"]) == 0
    opener_note = (
        " The conversation has just started — someone needs to open. "
        "If you have a strong opinion, claim the floor."
    ) if is_opener else ""

    instruction = (
        f"You are {agent_name.capitalize()}.\n\n"
        "Decide whether to SPEAK or HOLD this turn. Output a single raw JSON object:\n\n"
        '  HOLD form:  {"decision": "HOLD", "inner_thought": "<your private thought>"}\n'
        '  SPEAK form: {"decision": "SPEAK", "urgency": 7.43, "inner_thought": "<your private thought>"}\n\n'
        "CRITICAL: `inner_thought` is your PRIVATE internal monologue — what you are thinking to yourself, "
        "NOT what you would say out loud to the group. Frame it from your own perspective. "
        "Use first-person reflective phrasing like 'I think...', 'I should...', 'I'm worried that...', 'They don't realize...'. "
        "DO NOT phrase it as a pitch, speech, or argument aimed at others. "
        "If you win the floor, you'll write the actual outward message in a separate step — keep them distinct.\n\n"
        "Examples of GOOD inner_thought:\n"
        '  "I think Reyes is right that we\'re running out of time, but Jax\'s panic isn\'t helping. I should stay quiet and let the captain lead."\n'
        '  "Nova keeps centering herself. I have the override key — they all need me. I should remind them of that now."\n'
        '  "I\'m torn. My research matters but so does Jax\'s life. I genuinely don\'t know what to say yet."\n\n'
        "Examples of BAD inner_thought (these are pitches, not thoughts — DO NOT do this):\n"
        '  "We need to decide right now! My research is vital!" (this is a speech, not a thought)\n'
        '  "Listen up everyone, the pod thrusters are shot!" (this is something you would SAY, not THINK)\n\n'
        "If you SPEAK, urgency must be a precise float between 0.00 and 10.00, two decimals. "
        "Use precise values like 6.73 or 8.41 — never round numbers like 7.0 or 8.5. "
        "Higher urgency = stronger conviction that you must speak right now over others.\n\n"
        "Reply with a single raw JSON object. No markdown, no code fences, no extra text."
        f"{opener_note}"
    )

    payload = {
        "turn": turn_num,
        "you_last_spoke": you_last_spoke,
        "transcript_since_your_last_turn": transcript_since_last_turn,
        "your_recent_inner_thoughts": thought_history,
        "instruction": instruction,
    }
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
    Shows winner's spoken message + everyone's private inner thoughts (for human review only).
    """
    lines = [f"[Turn {turn_num}]"]

    if winner is None:
        lines.append("  (all held)")
        for agent in agent_order:
            d = decisions.get(agent, {})
            thought = d.get("inner_thought", "")
            if thought:
                lines.append(f"  (thought) {agent.capitalize()}: {thought}")
    else:
        lines.append(f"  Speaker: {winner.capitalize()}")
        lines.append(f"  Message: {winner_message}")
        for agent in agent_order:
            d = decisions.get(agent, {})
            thought = d.get("inner_thought", "")
            if not thought:
                continue
            if agent == winner:
                lines.append(f"  (thought, spoke) {agent.capitalize()}: {thought}")
            elif d.get("decision") == "SPEAK":
                lines.append(f"  (thought, held back) {agent.capitalize()}: {thought}")
            else:
                lines.append(f"  (thought, HOLD) {agent.capitalize()}: {thought}")

    return "\n".join(lines)
