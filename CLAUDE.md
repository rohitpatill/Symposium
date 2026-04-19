# Agent Teams — Multi-Agent Conversational Orchestration

## Project Overview

**Agent Teams** is a framework for simulating realistic group conversations between multiple AI agents with competing goals, asymmetric information, social dynamics, and fatigue mechanics. Agents bid for conversation control via urgency scores, manage held thoughts (suppressed intents), and exhibit human-like conversational patterns including repetition awareness and strategic silence.

**Current Scenario:** Three college friends (Aarav, Priya, Kabir) planning a weekend trip, each with conflicting preferences and personal memories that shape their decisions.

---

## Architecture

### Two-Phase Sequential Floor Protocol (Per Turn)

**Phase 1 (Parallel):** All agents decide simultaneously — HOLD or SPEAK with urgency (0-10 precise float).
- Returns: `{"decision": "HOLD"}` or `{"decision": "SPEAK", "urgency": 7.43, "reason": "..."}`

**Phase 2 (Sequential):** Highest urgency winner generates actual message.
- Winner receives intent injection, responds with: `{"response": "your actual message"}`
- Losers' reasons stored as held thoughts (max 2 per agent, private).

**Floor Selection Logic:**
- All HOLD → terminate after N consecutive (configurable, default 2)
- Single SPEAK → direct to Phase 2
- Multiple SPEAK → sort by urgency, pick highest; within tie threshold (0.3) → random

---

## Key Features

### 1. Repetition Awareness (Run 5)
- Tracks last 5 messages per agent via keyword matching
- Counts similar theme recurrences (e.g., Aarav: "himachal", "trek", "adventure")
- Passes `times_you_made_similar_point_recently` to decision prompt
- Agents see guidance: 0-1 (speak freely), 2 (caution), 3+ (fatigue — pivot, silence, or compromise)

### 2. Held Thoughts System
- Losers store their suppressed intent as private thought for future turns
- Max 2 per agent; oldest purged when limit exceeded
- Cleared when agent wins and speaks
- Visible in agent's decision context each turn

### 3. Memory Triggers
- Turn 3 onward: agents receive scenario-specific memory reminders
- Example: *"Remember: you secretly got food poisoning in Manali but didn't tell Priya"*
- Wired into decision user message payload

### 4. Precise Urgency Scoring
- API enforces JSON-only format via `"text": {"format": {"type": "json_object"}}`
- Prompt explicitly forbids round numbers (8.0, 8.5)
- Agents score 7.43, 8.61, 6.92 — precise conviction differences reduce meaningless ties

### 5. Flow Logging
- Real-time structured logs to `logs/flow_{timestamp}.log`
- Captures: steps, decisions, floor selection, messages, held thoughts, message array state
- Enables full-trace debugging without log noise

### 6. Asymmetric Personas
- Each agent has subjective view of others (in `personas.md`)
- Identity files include: personality, talkativeness, speech style, private goal, post-consensus behavior
- Sub-group memory filtering: agents only see pair-specific memories they're part of

---

## File Structure

```
D:\Study\Agent Teams Main\Agent Teams Updated\
├── main.py                          # Entry point, initializes flow logging
├── config.py                        # All constants (model, API, protocol settings)
├── requirements.txt                 # Dependencies
│
├── src/
│   ├── agent.py                     # Agent class: held thoughts, API calls, JSON parsing
│   ├── orchestrator.py              # Turn loop, phase 1/2 logic, floor selection, repetition tracking
│   ├── context_builder.py           # Builds decision/response prompts with all context
│   ├── logger.py                    # Per-agent logs, transcript, decisions JSONL
│   └── flow_logger.py               # Real-time flow tracing (step, decision, floor, message, etc.)
│
├── agents/
│   ├── aarav/
│   │   ├── identity.md              # Personality, goal, handling defeat, urgency tendency
│   │   ├── memory.md                # Aarav's private memories
│   │   └── personas.md              # How Aarav sees Priya and Kabir
│   ├── priya/
│   │   ├── identity.md
│   │   ├── memory.md
│   │   └── personas.md
│   └── kabir/
│       ├── identity.md
│       ├── memory.md
│       └── personas.md
│
├── shared/
│   ├── kickoff.md                   # Initial scenario prompt (turn 0)
│   ├── protocol.md                  # Two-phase rules, SPEAK/HOLD criteria, social fatigue
│   └── group_memories.md            # Shared + pair-specific group history (filtered per agent)
│
├── runs/
│   └── YYYY-MM-DD_HH-MM-SS/        # Per-run outputs
│       ├── aarav.log                # Agent-specific API call trace
│       ├── priya.log
│       ├── kabir.log
│       ├── transcript.md            # Human-readable conversation
│       ├── decisions.jsonl          # Phase 1 decisions per turn (includes losers' reasons)
│       └── raw.jsonl                # Full API request/response replay
│
├── logs/
│   └── flow_YYYY-MM-DD_HH-MM-SS.log # Real-time flow trace (structure + debugging)
│
├── RUN4_CONTEXT.md                  # Run 4 summary (sequential floor protocol)
├── RUN5_SPEC.md                     # Run 5 spec (social fatigue & repetition awareness)
├── CLAUDE.md                        # This file
└── .env                             # OpenAI API key (Bearer token)
```

---

## Configuration (config.py)

```python
MODEL = "gpt-4o-mini"                      # OpenAI model
API_URL = "https://api.openai.com/v1/responses"  # /v1/responses endpoint
API_KEY = ...                              # From .env, with Bearer prefix

AGENTS = ["aarav", "priya", "kabir"]
MAX_TURNS = 20
CONSECUTIVE_HOLDS_TO_STOP = 2              # Termination: N all-HOLD turns

URGENCY_TIE_THRESHOLD = 0.3                # Floor selection: pick random within 0.3 of top
MAX_HELD_THOUGHTS = 2                      # Per-agent thought limit
DECISION_MAX_TOKENS = 150                  # Phase 1 output budget
RESPONSE_MAX_TOKENS = 500                  # Phase 2 output budget

AGENTS_DIR = "agents"
SHARED_DIR = "shared"
RUNS_DIR = "runs"
```

---

## Prompt Engineering

### Phase 1 Decision (src/context_builder.py)

```
"You are {agent_name}. Decide: HOLD, or SPEAK with urgency (0-10 precise float, 2 decimals) and 1-2 line reason. 
Urgency must reflect your exact conviction — use precise values like 6.73 or 8.41, never round numbers like 7.0 or 8.5. 
Reply with a single raw JSON object starting with { and ending with }. 
No markdown, no code fences, no extra text."
```

Plus context payload:
```json
{
  "turn": 5,
  "you_last_spoke": "turn 3",
  "transcript_since_your_last_turn": [...],
  "your_held_thoughts": ["turn 4: wanted to push back on safety"],
  "times_you_made_similar_point_recently": 2,
  "memory_reminder": "Remember: you got food poisoning in Manali",
  "instruction": "..."
}
```

### Phase 2 Response (Phase 2 intent injection in agent.py)

```
"You won the floor. Generate your actual message now. Reply with a single raw JSON object starting with { and ending with }. 
No markdown, no code fences, no extra text."
```

---

## Message Array Invariant (Per Turn)

Each agent's message list grows:
1. **Orchestrator appends** Phase 1 decision user message
2. **call_decision() appends** one assistant message (JSON decision)
3. **call_response() appends** (winners only):
   - One user message (intent injection)
   - One assistant message (JSON response)

**Losers:** +1 message per turn (decision only)  
**Winners:** +3 messages per turn (decision + intent + response)

This keeps full conversation context in the message array for Phase 2 intent coherence.

---

## API Integration

**Endpoint:** `/v1/responses` (not `/v1/chat/completions`)  
**Format:** `{"model", "input": [{role, content}], "max_output_tokens", "text": {"format": {"type": "json_object"}}}`  
**Auth:** Bearer token in `.env`, passed as full Authorization header value

**JSON Parsing Fix:**
```python
clean = response_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
result = json.loads(clean)
```

---

## Running a Scenario

### Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Add API key to .env
echo "Bearer sk-..." > .env

# Run conversation
python main.py
```

### Output
- **Console:** Real-time turn summaries, decision prints, floor announcements
- **logs/flow_*.log:** Detailed flow trace (every step, decision, message state)
- **runs/YYYY-MM-DD_**/:** Full run logs (transcript.md, decisions.jsonl, per-agent logs, raw.jsonl)

---

## Adding New Scenarios

To explore different group dynamics, agent types, or histories:

1. **Create new agent folders** in `agents/`:
   - `identity.md` (personality, goal, defeat handling)
   - `memory.md` (private memories)
   - `personas.md` (how this agent sees others)

2. **Create new shared context** in `shared/`:
   - `kickoff.md` (new scenario prompt)
   - `protocol.md` (if scenario needs custom rules)
   - `group_memories.md` (shared + pair-specific history)

3. **Update config.py** if needed:
   - Change `AGENTS` list
   - Adjust turn limits, tie threshold, token budgets

4. **Run:** `python main.py`

**Everything else stays the same** — the orchestrator, logger, and protocol are scenario-agnostic.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `/v1/responses` not `/v1/chat/completions` | Supports JSON format enforcement at API level |
| Precise urgency (7.43 not 7.5) | Reduces meaningless ties, forces genuine conviction scoring |
| Held thoughts stay private | Only winner speaks; losers' suppressed intents don't enter group context |
| Message array grows (never purged) | Maintains full context for Phase 2 coherence; no truncation |
| Repetition tracked last 5 messages | Window large enough to catch patterns, small enough to avoid ancient history |
| Keyword matching for themes | Fast and interpretable; embedding similarity available for v2 if needed |
| Flow logging separate from decision logs | Real-time trace aids debugging; structured logs enable replay |

---

## Known Limitations & Future Work

1. **Keyword matching is crude** — Aarav might use "views" instead of "mountain"; add more keywords after first run if needed
2. **Agents may overcorrect to HOLD** — If everyone goes silent, strengthen "pivot" and "concede logistics" guidance
3. **No consensus detection** — Currently terminates on all-HOLD; could detect explicit agreement instead
4. **No multi-round compromise** — Agents don't iteratively negotiate (e.g., "half Goa, half trek")
5. **No interrupts** — All agents decide in parallel; no overlapping speech simulation

---

## Debugging Tips

### Flow Log Analysis
```bash
grep "repetition_count" logs/flow_*.log
grep "WARN\|ERROR" logs/flow_*.log
grep "decision_msg_preview" logs/flow_*.log | head -5
```

### Decision Payloads
```bash
jq '.decisions' runs/*/decisions.jsonl | head -20
```

### Full Replay
```bash
jq '.' runs/*/raw.jsonl | less
```

### Agent Message Trace
```bash
grep "MSGS.*aarav" logs/flow_*.log | tail -10
```

---

## Contact & Questions

This system was built iteratively over Runs 1–5 to explore:
- Multi-agent conversational dynamics
- Urgency-based floor selection
- Social fatigue & repetition awareness
- Realistic disagreement & held thoughts

For questions about architecture or scenarios, refer to `RUN4_CONTEXT.md` and `RUN5_SPEC.md`.
