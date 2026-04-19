# Project Context — Complete Structure Guide

This document provides exhaustive guidance on the project structure, file organization, and content requirements. Use this as a blueprint when adding new agents, scenarios, or modifying existing ones.

---

## Table of Contents

1. [Root Level Files](#root-level-files)
2. [Source Code Directory (`src/`)](#source-code-directory-src)
3. [Agents Directory (`agents/`)](#agents-directory-agents)
4. [Shared Directory (`shared/`)](#shared-directory-shared)
5. [Outputs Directory (`runs/`)](#outputs-directory-runs)
6. [Logs Directory (`logs/`)](#logs-directory-logs)
7. [How to Add a New Agent](#how-to-add-a-new-agent)
8. [How to Add a New Scenario](#how-to-add-a-new-scenario)
9. [Content Guidelines per File Type](#content-guidelines-per-file-type)

---

## Root Level Files

### `main.py`
**Purpose:** Entry point for the conversation orchestration.

**What it does:**
- Imports config, Orchestrator, and flow_logger
- Creates run directory with timestamp
- Initializes flow logger
- Instantiates Orchestrator
- Runs the conversation loop

**When to modify:**
- Rarely. Only if you want to change bootstrap behavior or add pre/post-run logic.

**When NOT to modify:**
- When adding new agents or scenarios — just update config and agent/shared folders.

---

### `config.py`
**Purpose:** Central configuration for all runs.

**What it contains:**

```python
# API Configuration
MODEL = "gpt-4o-mini"
API_URL = "https://api.openai.com/v1/responses"
API_KEY = ...  # Read from .env

# Protocol Settings
AGENTS = ["aarav", "priya", "kabir"]  # Agent names (must match folder names)
MAX_TURNS = 20                         # Hard cap on conversation turns
CONSECUTIVE_HOLDS_TO_STOP = 2          # Terminate after N all-HOLD turns

# Floor Selection & Dynamics
URGENCY_TIE_THRESHOLD = 0.3            # Within 0.3 of top urgency → random pick
MAX_HELD_THOUGHTS = 2                  # Max suppressed intents per agent

# Token Budgets
DECISION_MAX_TOKENS = 150              # Phase 1 output limit
RESPONSE_MAX_TOKENS = 500              # Phase 2 output limit

# Directories
AGENTS_DIR = "agents"
SHARED_DIR = "shared"
RUNS_DIR = "runs"
```

**When to modify:**
- **Adding new agents:** Update `AGENTS` list with new names (must match folder names in `agents/`)
- **Changing protocol:** Adjust `CONSECUTIVE_HOLDS_TO_STOP`, `URGENCY_TIE_THRESHOLD`, token budgets
- **Changing model:** Update `MODEL` and `API_URL` (if using different endpoint)

**Example for 4-agent scenario:**
```python
AGENTS = ["aarav", "priya", "kabir", "neha"]
MAX_TURNS = 25  # Longer conversations with more agents
URGENCY_TIE_THRESHOLD = 0.2  # Stricter tie-breaking with more competition
```

---

### `.env`
**Purpose:** Store API key (never commit to git).

**Format:**
```
Bearer sk-proj-xxx...
```

**Note:** Full Authorization header value (with "Bearer" prefix). This is passed directly to the API.

---

### `requirements.txt`
**Purpose:** Python dependencies.

**Current:**
```
requests>=2.31.0
python-dotenv>=1.0.0
```

**When to modify:**
- Only if adding new external libraries (rarely needed).

---

### `RUN4_CONTEXT.md`
**Purpose:** Documentation of Run 4 (sequential floor protocol implementation).

**When to read:**
- Understanding how the two-phase protocol was built
- Reference for how floor selection and held thoughts work

**When to modify:**
- Historical reference — don't modify. Create new RUN#_CONTEXT.md for new iterations.

---

### `RUN5_SPEC.md`
**Purpose:** Specification for Run 5 (social fatigue & repetition awareness).

**When to read:**
- Understanding how repetition tracking and social fatigue work
- How agents decide to pivot, concede, or go silent

**When to modify:**
- Historical reference — don't modify. Create new RUN#_SPEC.md for new iterations.

---

### `CLAUDE.md`
**Purpose:** Quick reference for Claude Code IDE integration.

**Contents:**
- Project overview
- Architecture summary
- File structure
- Key features
- How to run
- Debugging tips

**When to modify:**
- When you make significant architectural changes
- Keep it concise (1-2 pages)

---

### `CONTEXT.md` (This File)
**Purpose:** Exhaustive guide for project structure and content.

**Contents:**
- What each file should contain
- How to add new agents
- How to add new scenarios
- Content guidelines

**When to modify:**
- When you introduce new file types or structure patterns
- Document new conventions clearly

---

## Source Code Directory (`src/`)

All files in `src/` are scenario-agnostic. They work with any agent configuration defined in `agents/` and `shared/`.

### `agent.py`
**Purpose:** Defines the Agent class — core logic for individual agents.

**Key Methods:**

#### `__init__(self, name: str)`
Initializes an agent by loading static files.

**Loads:**
- `identity.md` — Agent personality and goals
- `memory.md` — Agent's private memories
- `personas.md` — Agent's subjective views of others
- `shared/group_memories.md` — Filtered group history (sub-groups only)
- `shared/protocol.md` — Shared protocol rules

**Builds:**
- `self.system_prompt` — Concatenation of all above files

**Maintains:**
- `self.messages` — Growing list of {role, content} pairs
- `self.held_thoughts` — List of turn-based suppressed intents

---

  #### `append_user_message(content: str)` / `append_assistant_message(content: str)`
Appends to message array. Used by orchestrator to add decision prompts and responses.

---

#### `add_held_thought(turn: int, reason: str)`
Called when agent loses floor. Stores reason as private thought.

**Logic:**
- Appends `f"turn {turn}: {reason}"`
- If list exceeds `MAX_HELD_THOUGHTS`, pops oldest

**Example:**
```python
agent.add_held_thought(5, "I wanted to push for Himachal but Kabir had higher urgency")
# Result: agent.held_thoughts = ["turn 5: I wanted to push..."]
```

---

#### `clear_held_thoughts()`
Called after agent wins and speaks. Resets held thoughts to empty list.

---

#### `call_decision() -> dict`
**Phase 1 API call.**

**What it does:**
1. Calls `_post(max_tokens=DECISION_MAX_TOKENS)`
2. Extracts JSON from response
3. Parses JSON (strips markdown code fences)
4. Appends assistant message to array
5. Returns parsed decision

**Returns:**
```python
{
    "name": "aarav",
    "decision": "SPEAK" or "HOLD",
    "urgency": 7.43,  # If SPEAK
    "reason": "want to push back on safety concerns",  # If SPEAK
    "raw_output": "...",  # Full API response text
    "usage": {...}  # Token usage
}
```

**JSON Parsing Logic:**
```python
clean = decision_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
result = json.loads(clean)
```

This strips markdown code fences that the API might add, ensuring pure JSON parsing.

---

#### `call_response(intent: str) -> dict`
**Phase 2 API call (winners only).**

**What it does:**
1. Builds intent injection message (JSON with instruction + intent)
2. Appends intent message to array
3. Calls `_post(max_tokens=RESPONSE_MAX_TOKENS)`
4. Extracts and parses JSON response
5. Appends assistant message to array
6. Returns parsed response

**Intent Injection Payload:**
```json
{
    "instruction": "You won the floor. Generate your actual message now. Reply with a single raw JSON object starting with { and ending with }. No markdown, no code fences, no extra text.",
    "your_intent": "want to push for Himachal trekking",
    "format": "{\"response\": \"your message here\"}"
}
```

**Returns:**
```python
{
    "name": "aarav",
    "response": "Guys, come on! Himachal trekking is epic...",
    "raw_output": "...",
    "usage": {...}
}
```

---

#### `_post(max_tokens: int) -> dict`
**Internal HTTP POST to OpenAI API.**

**Payload Structure:**
```python
{
    "model": config.MODEL,
    "input": self._build_input_list(),  # Converted message array
    "max_output_tokens": max_tokens,
    "text": {"format": {"type": "json_object"}}  # Force JSON format
}
```

**Headers:**
```python
{
    "Authorization": config.API_KEY,  # Full Bearer token
    "Content-Type": "application/json"
}
```

**Key Detail:** `"text": {"format": {"type": "json_object"}}` enforces JSON output at the API level, preventing markdown wrapping.

---

#### `_build_input_list() -> list`
Converts agent's message array to `/v1/responses` format.

**Input (agent.messages):**
```python
[
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
]
```

**Output (API format):**
```python
[
    {
        "role": "user",
        "content": [{"type": "input_text", "text": "..."}]
    },
    {
        "role": "user",
        "content": [{"type": "input_text", "text": "..."}]
    },
    {
        "role": "assistant",
        "content": [{"type": "output_text", "text": "..."}]
    }
]
```

**Note:** System role is converted to user role (OpenAI /v1/responses quirk).

---

#### `_extract_text(api_response: dict) -> str`
Extracts text from `/v1/responses` response format.

```python
# From:
{"output": [{"content": [{"text": "..."}]}]}

# Extract:
"..."
```

---

**When to modify `agent.py`:**
- Adding new agent state (e.g., emotion tracking, commitment tracker)
- Changing message array structure or API format
- Modifying JSON parsing logic (if API response format changes)

**When NOT to modify:**
- Changing agent behavior — use identity.md, memory.md, personas.md, protocol.md
- Changing urgency logic — modify context_builder.py prompts

---

### `orchestrator.py`
**Purpose:** Turn loop, floor selection, repetition tracking, state management.

**Key State Variables:**

```python
self.agents: dict[str, Agent]           # All agent instances
self.logger: Logger                      # Logging system
self.turn: int                           # Current turn number
self.consecutive_all_hold: int           # Counter for all-HOLD termination
self.last_spoke: dict[str, int]          # Track when each agent last spoke
self.shared_transcript: list              # List of {"turn", "speaker", "message"}
self.agent_speech_history: dict[str, list]  # Last 5 messages per agent (Run 5)
```

---

**Key Methods:**

#### `bootstrap() -> None`
Called once before conversation starts.

**What it does:**
1. Loads `shared/kickoff.md`
2. Appends kickoff as user message to all agents
3. Seeds `shared_transcript` with kickoff as turn 0

**Why turn 0?**
- Agents see kickoff in `transcript_since_your_last_turn` on turn 1
- Establishes baseline context

---

#### `run_turn() -> bool`
Executes one full turn (Phase 1 + Phase 2).

**Returns:** `True` to continue, `False` to terminate.

**Phase 1 Logic:**
1. For each agent:
   - Build decision user message (with context: transcript, held thoughts, repetition count, memory trigger)
   - Append to agent's message array
2. Parallel `call_decision()` on all agents
3. Log all decisions (including losers' reasons)

**Floor Selection Logic:**
1. Filter agents with `decision == "SPEAK"` into `speakers` dict
2. If empty: increment `consecutive_all_hold`, check termination
3. If non-empty:
   - Sort by urgency descending
   - Find all within `URGENCY_TIE_THRESHOLD` of top
   - Random pick from tied group
4. Losers: add their reason as held thought
5. Winner: stored message, clear held thoughts

**Phase 2 Logic:**
1. Winner calls `call_response(intent)`
2. Winner message appended to `shared_transcript`
3. Update `agent_speech_history` (last 5 messages)
4. Log turn + API calls

---

#### `_transcript_since(last_turn: int) -> list`
Returns all `shared_transcript` entries after given turn.

**Used by:** Decision context builder to show what agent missed while not speaking.

**Example:**
```python
# If agent last spoke on turn 3
self._transcript_since(3)
# Returns: [turn 4 message, turn 5 message, ...]
```

---

#### `_memory_trigger_for(name: str, turn: int) -> Optional[str]`
Returns agent-specific memory reminder from turn 3 onward.

**Current Implementation:**
```python
triggers = {
    "aarav": "Remember: you secretly got food poisoning in Manali but didn't tell Priya",
    "priya": "Remember: you got food poisoning in Manali from a dhaba and you never want that again",
    "kabir": "Remember: you hate Manali food, you prefer Goa seafood"
}
return triggers.get(name) if turn >= 3 else None
```

**When to modify:**
- Changing memory triggers for current agents
- Adding triggers for new agents

---

#### `_count_similar_recent_points(agent_name: str) -> int`
**Run 5 feature:** Counts how many of agent's last 5 messages pushed the same theme.

**Theme Keywords (per agent):**
```python
{
    "aarav": ["himachal", "trek", "adventure", "thrill", "mountain", "hike", "epic", "adrenaline", "peaks", "views"],
    "priya": ["safety", "comfort", "manali", "food poisoning", "risk", "safe", "planned", "predictable", "health"],
    "kabir": ["food", "seafood", "goa", "meal", "cuisine", "eat", "restaurant", "quality", "taste", "cook"],
}
```

**Algorithm:**
1. Get last 5 messages from agent's speech history
2. For each message, count keyword matches (need ≥2 matches)
3. Return total count of theme-matching messages

**Returns:** 0-5 (capped at 5 messages in history)

**When to modify:**
- Adding new agents with new themes — expand theme_keywords dict
- Changing what counts as "repetition" — adjust keyword lists or threshold (currently ≥2)

---

**When to modify `orchestrator.py`:**
- Changing turn loop logic
- Modifying floor selection algorithm
- Adding new state tracking (e.g., consensus detector)
- Adjusting memory triggers or repetition themes

**When NOT to modify:**
- Changing agent behavior — modify agent.py or prompts
- Changing protocol rules — modify shared/protocol.md

---

### `context_builder.py`
**Purpose:** Build Phase 1 decision user message and Phase 2 response format.

**Functions:**

#### `build_decision_user_message(...) -> str`
Builds the JSON payload that becomes the Phase 1 user message.

**Signature:**
```python
def build_decision_user_message(
    turn_num: int,
    agent_name: str,
    you_last_spoke: str,
    transcript_since_last_turn: list[dict],
    held_thoughts: list[str],
    repetition_count: int = 0,
    memory_trigger: Optional[str] = None,
) -> str:
```

**Returns JSON Payload:**
```json
{
    "turn": 5,
    "you_last_spoke": "turn 3",
    "transcript_since_your_last_turn": [
        {"turn": 4, "speaker": "Kabir", "message": "..."},
        {"turn": 5, "speaker": "Priya", "message": "..."}
    ],
    "your_held_thoughts": [
        "turn 4: wanted to push for Himachal"
    ],
    "times_you_made_similar_point_recently": 2,
    "memory_reminder": "Remember: you got food poisoning in Manali",
    "instruction": "You are Aarav. Decide: HOLD, or SPEAK with urgency (0-10 precise float, 2 decimals) and 1-2 line reason. Urgency must reflect your exact conviction — use precise values like 6.73 or 8.41, never round numbers like 7.0 or 8.5. Reply with a single raw JSON object starting with { and ending with }. No markdown, no code fences, no extra text. The conversation has just started — someone needs to open. If you have a strong opinion, claim the floor."
}
```

**Instruction Components:**
- **Base instruction:** HOLD or SPEAK + urgency + reason format
- **Urgency detail:** Precise decimals, no round numbers, examples (6.73, 8.41)
- **JSON format:** Raw object, no fences, no markdown
- **Opener nudge:** "The conversation has just started..." (only on turn 1 with no prior speakers)

**When to modify:**
- Changing what context agents see
- Adding new fields to decision payload
- Adjusting prompt instruction (but do this sparingly — it's prompt engineering)

---

#### `format_transcript_for_log(...) -> str`
Formats a turn for human-readable transcript.

**Input:**
```python
turn_num=5,
winner="aarav",
winner_message="Guys, Himachal is epic!",
decisions={
    "aarav": {"decision": "SPEAK", "urgency": 8.5, "reason": "..."},
    "priya": {"decision": "HOLD"},
    "kabir": {"decision": "SPEAK", "urgency": 7.2, "reason": "..."}
},
agent_order=["aarav", "priya", "kabir"]
```

**Output (Markdown):**
```
[Turn 5]
  Speaker: Aarav
  Message: Guys, Himachal is epic!
  (held) Priya: HOLD
  (held) Kabir wanted: Goa seafood is unbeatable
```

**Logic:**
- If winner is None: print "(all held)"
- If winner exists: show message + losers' held intents
- Format: (held) {AgentName} [wanted: reason] or [HOLD]

**When to modify:**
- Changing transcript format (rarely)
- Adding new per-turn metadata

---

**When to modify `context_builder.py`:**
- Changing what context agents see
- Adjusting Phase 1 or Phase 2 prompts
- Adding new decision payload fields

**When NOT to modify:**
- Agent logic — modify agent.py
- Turn loop logic — modify orchestrator.py

---

### `logger.py`
**Purpose:** Collect and write all run outputs.

**Key Methods:**

#### `log_api_call(agent_name, turn_num, payload, response)`
Logs request/response for both decision and response calls.

**Stores in:**
- `self.agent_logs[agent_name]` — per-agent list
- `self.raw_calls` — global list for replay

**Payload:** The decision JSON or response instruction JSON  
**Response:** Parsed API response dict (with usage tokens)

---

#### `log_decisions(turn_num, decisions)`
Logs Phase 1 decisions (includes losers' reasons — never enters agent context).

**Input:**
```python
{
    "turn": 5,
    "decisions": {
        "aarav": {"decision": "SPEAK", "urgency": 8.5, "reason": "..."},
        "priya": {"decision": "HOLD"},
        "kabir": {"decision": "SPEAK", "urgency": 7.2, "reason": "..."}
    }
}
```

**Stored in:** `self.decision_log` (written as JSONL)

---

#### `log_turn(turn_num, formatted)`
Logs formatted turn for human-readable transcript.

**Stored in:** `self.transcript_lines` (joined and written as Markdown)

---

#### `write_files()`
Called at end of run. Writes all accumulated logs to `run_dir/`.

**Outputs:**

1. **Per-agent logs** (`{agent}.log`):
   ```markdown
   # AARAV — API Call Log
   
   ## Turn 1
   **Time:** 2026-04-19T...
   
   ### Request
   ```json
   {"turn": 1, ...}
   ```
   
   ### Response
   ```json
   {"decision": "SPEAK", ...}
   ```
   ```

2. **Transcript** (`transcript.md`):
   ```markdown
   # Conversation Transcript
   
   Weekend trip planning conversation between Aarav, Priya, and Kabir.
   
   ---
   
   [Turn 1]
   Speaker: Aarav
   ...
   ```

3. **Decisions** (`decisions.jsonl`):
   ```jsonl
   {"turn": 1, "decisions": {...}}
   {"turn": 2, "decisions": {...}}
   ```
   One line per turn, full decision state including losers.

4. **Raw replay** (`raw.jsonl`):
   ```jsonl
   {"timestamp": "...", "agent": "aarav", "turn": 1, "payload": {...}, "response": {...}}
   ```
   Every API call for replay or analysis.

---

**When to modify `logger.py`:**
- Adding new output formats
- Changing how logs are written
- Adding new per-run metadata

**When NOT to modify:**
- Most of the time — this is stable infrastructure

---

### `flow_logger.py`
**Purpose:** Real-time structured flow tracing for debugging.

**Functions:**

#### `init(run_timestamp: str)`
Initialize flow logger, create `logs/flow_{timestamp}.log`.

Called once at program start.

---

#### Core Logging Functions

```python
step(label: str)           # Major step: "turn 5: phase 1 — building decision messages"
info(label: str, data)     # Information: "aarav: held_thoughts", ["turn 4: ..."]
ok(label: str)             # Success: "bootstrap complete"
warn(label: str)           # Warning: "turn 13: ALL HOLD (consecutive=2)"
error(label: str, exc)     # Error with optional exception
decision(turn, name, decision, urgency, reason)  # Decision summary
floor(turn, winner, urgency, all_speakers)       # Floor selection result
message(turn, speaker, text)                     # Message spoken
held(turn, agent, reason)                        # Held thought stored
transcript_state(shared_transcript)              # Snapshot of transcript
agent_messages_state(name, messages)             # Snapshot of agent's message array
```

**Output Format (timestamped, prefixed):**
```
[21:20:52.418] STEP  | bootstrap: loading kickoff
[21:20:52.418] INFO  | kickoff_length: 352
[21:20:59.373] DEC   | turn=1 agent=aarav SPEAK urgency=8.25 reason='...'
[21:20:59.375] FLOOR | turn=1 winner=aarav urgency=8.25 competed=['aarav', 'priya', 'kabir']
```

**Purpose:**
- Real-time visibility into execution
- Debugging decision payloads, message arrays, floor logic
- Tracing agent state over conversation

**When to modify:**
- Adding new logging points in orchestrator
- Changing log format (rarely)

---

**When NOT to modify:**
- Unless you want to add new logging categories

---

## Agents Directory (`agents/`)

Each agent is a folder with three required markdown files.

```
agents/
├── aarav/
│   ├── identity.md       # Personality, goals, urgency tendency
│   ├── memory.md         # Private memories (only this agent sees)
│   └── personas.md       # How aarav sees priya and kabir
├── priya/
│   ├── identity.md
│   ├── memory.md
│   └── personas.md
└── kabir/
    ├── identity.md
    ├── memory.md
    └── personas.md
```

**Key Rule:** Agent folder name must match `config.AGENTS` list.

---

### `{agent}/identity.md`

**Purpose:** Define the agent's personality, private goal, speech style, and how to handle conflict/defeat.

**Required Sections:**

#### 1. Header Information
```markdown
# {Name} — Identity

**Name:** {Name}  
**Age:** {Age}  
**Core Personality:** {Traits}
```

**Example:**
```markdown
# Aarav — Identity

**Name:** Aarav  
**Age:** 24  
**Core Personality:** Adventurous, extrovert, impulsive, budget-conscious, optimistic, risk-taker, competitive.
```

---

#### 2. Communication Profile
```markdown
**Talkativeness:** {0-1} (description)  
**Speech Style:** {Description of how they talk}  
**Quirks:** {Unique mannerisms}
```

**Example:**
```markdown
**Talkativeness:** 0.85 (talks a lot, doesn't hold back)  
**Speech Style:** Casual, uses "yaar," exclamation marks, speaks fast and energetically. Comfortable with emojis when excited.  
**Quirks:** Makes adventure metaphors, gets excited easily, sometimes steamrolls others, hates being seen as the "boring" one.
```

**Talkativeness Scale (for orchestrator frequency):**
- 0.2-0.4: Speaks rarely, quiet personality
- 0.4-0.6: Moderate, balanced
- 0.6-0.85: Talks frequently, outgoing
- 0.85-1.0: Very talkative, dominant personality

---

#### 3. Private Goal (CRITICAL)
```markdown
**Private Goal for This Trip:** {What agent wants to achieve}

**Important:** {Guidance on how stubborn to be, when to compromise}
```

**Example:**
```markdown
**Private Goal for This Trip:** Convince the group to go trekking in Himachal Pradesh — somewhere truly adventurous, off-the-beaten-path. Defend this goal hard. Don't accept a "mini hike" as a win. Push back at least twice before compromising.

**Important:** You have pride about being the adventure guy. Don't let Goa win easily. Argue for Himachal multiple times before accepting compromise.
```

**Key Details:**
- Be specific about what "winning" looks like
- Specify how many times to push before compromising
- Guide what concession is acceptable

---

#### 4. Post-Consensus Behavior
```markdown
**Post-consensus behavior:** {What to do after group decides}
```

**Example:**
```markdown
**Post-consensus behavior:** Once Goa (or whatever) is agreed, you've lost. Stop trying to re-inject Himachal energy. You can bring it up ONCE more as a callback ("next trip is mine though"), then drop it. After that, HOLD unless real logistics come up.
```

**Why:** Prevents agents from repeatedly re-opening settled debates.

---

#### 5. Handling Defeat (Run 5)
```markdown
## Handling Defeat

{Options for what to do when conviction meets resistance}

- Option 1: Go silent
- Option 2: Concede logistics
- Option 3: Propose compromise
- Option 4: Pivot to sub-argument

{Guidance on pride/face-saving}
```

**Example:**
```markdown
## Handling Defeat

You are persistent, not obtuse. After pushing Himachal 3 times without anyone budging, a real Aarav does one of:
- Goes quiet for a turn or two, visibly sulking
- Proposes a compromise: "fine, Goa, but at least a day trek from there"
- Concedes with grumbling: "ugh okay Goa, but next trip is mine"
- Pivots to win a smaller fight: pick the resort, pick the activities

Restating "Himachal is epic!" a 4th time makes you look stupid, not stubborn. You have pride — don't burn it on a lost argument.
```

---

#### 6. Urgency Tendency (CRITICAL)
```markdown
## Urgency Tendency

{How high this agent scores when they want to speak}
```

**Example:**
```markdown
## Urgency Tendency

You're an extrovert. You tend to score high (5–9) when you have something to say. You rarely HOLD if you have any opinion. But — don't inflate past what you genuinely feel. If you're just echoing, HOLD.
```

**Guidance:**
- Extroverts: tend toward 5-9
- Introverts: tend toward 3-6
- Passion triggers: can spike to 9-10
- Indifferent moments: stay 2-4

---

#### 7. Values (Optional but Recommended)
```markdown
**What He/She Values:** {Core values that drive decisions}
```

**Example:**
```markdown
**What She Values:** Safety, comfort, planning ahead, avoiding regret, loyalty to friends.
```

---

#### 8. Special Rules (Optional)
```markdown
**When you win:** {Behavior after winning floor}
**When you lose:** {Behavior after losing floor}
**No [emoji/style] restrictions:**
```

**Example:**
```markdown
**No emojis. Ever.** Not even one. You are measured and it shows in your text.

**Speak less than the others.** Your talkativeness is 0.45. For every 2 times Aarav or Kabir speaks, you should speak roughly once.

**When you win:** Don't celebrate. Move straight into logistics — dates, booking, budget. Victory for you looks like planning, not cheering.
```

---

**When to modify identity.md:**
- Changing agent personality or goals
- Adding new handling guidance (e.g., how to deal with interrupts)
- Clarifying speech patterns or post-consensus behavior

---

### `{agent}/memory.md`

**Purpose:** Agent's private memories. Only this agent sees these. NOT shared with others.

**Structure:** Free-form markdown. Typically organized by topic or time period.

**Example (Aarav):**
```markdown
# Aarav's Memories

## The Manali Trip (Last Year)
- Got food poisoning from street food in Manali
- Hid this from Priya (didn't want to worry her)
- Still got amazing trekking experiences despite the illness
- Remembers that adventure was worth the hiccup

## Trip Planning Tendencies
- Always want to go somewhere adventurous
- Budget-conscious, but willing to spend for adrenaline
- Competitive with Kabir on food/comfort vs. adventure trade-offs

## Relationship Notes
- Priya: cares about safety, might overreact if she knew about food poisoning
- Kabir: obsessed with food quality, always brings up Manali meals
```

**Guidelines:**
- **Personal facts:** Things only this agent knows (secrets, private concerns)
- **Historical context:** Past trips, shared experiences, insider knowledge
- **Opinions:** How agent truly feels about others (not shared)
- **Vulnerabilities:** Worries or insecurities that might influence decisions

**Key:** These memories inform the agent's system prompt but are never quoted or referenced to other agents.

---

**When to modify memory.md:**
- Changing agent backstory
- Adding new private motivations
- Clarifying why agent holds certain positions

---

### `{agent}/personas.md`

**Purpose:** How THIS agent sees OTHER agents. Subjective, potentially biased.

**Structure:** One section per other agent.

**Example (How Aarav sees Priya and Kabir):**
```markdown
## How Aarav Sees Priya

**Priya:** Super organized and safe. Sometimes TOO cautious. Gets stressed about logistics. Good at planning, but can kill spontaneity with all her "what-ifs." Loyal friend though, even if she won't admit wanting adventure.

**Risk Level:** Low risk-taker. Plays it safe. Probably won't go for Himachal.  
**Common Ground:** We both care about our friend group, even if we show it differently.  
**Leverage:** Appeal to planning side — promise organized trek with pre-booked meals.

---

## How Aarav Sees Kabir

**Kabir:** Obsessed with food. Like, unreasonably obsessed. It's funny but also limiting. Will always pick destination based on restaurants, not experiences. Easier to convince than Priya, but only if I make the food argument work.

**Risk Level:** Moderate. Willing to try things, but won't sacrifice food.  
**Common Ground:** Both want experiences, just different kinds.  
**Leverage:** Promise amazing local cuisine in Himachal mountain spots. Research restaurants hard.
```

**Guidelines:**
- **Honest bias:** This is agent's subjective view, may be inaccurate
- **Leverage points:** What might convince each person
- **Relationship framing:** How agent understands others' personalities
- **Potential misconceptions:** Room for agent to be wrong

**Key:** These personas appear in agent's system prompt, shaping how they approach others.

---

**When to modify personas.md:**
- Changing relationship dynamics
- Adding new insights or vulnerabilities
- Adjusting leverage points

---

**Important:** Sub-Group Filtering

When agent loads `shared/group_memories.md`, the orchestrator filters it to show only:
1. "## All Three" section
2. Sections matching this agent's name

**Example:**
```markdown
# Group Memories

## All Three
Shared experience all remember...

## Aarav & Priya
Only Aarav and Priya see this.

## Priya & Kabir
Only Priya and Kabir see this.

## Aarav & Kabir
Only Aarav and Kabir see this.
```

Aarav sees: "All Three" + "Aarav & Priya" + "Aarav & Kabir"  
Priya sees: "All Three" + "Aarav & Priya" + "Priya & Kabir"  
Kabir sees: "All Three" + "Priya & Kabir" + "Aarav & Kabir"

---

## Shared Directory (`shared/`)

Shared context visible to all agents (or filtered per agent).

```
shared/
├── kickoff.md           # Initial scenario prompt (turn 0)
├── protocol.md          # Rules for decision-making
└── group_memories.md    # Shared + sub-group histories
```

---

### `shared/kickoff.md`

**Purpose:** Initial scenario prompt. Sets up the conversation premise.

**Format:** Markdown, conversational tone.

**Example (Weekend Trip Planning):**
```markdown
# Kickoff Message

It's Saturday evening. The three of you are in a WhatsApp group chat planning your next weekend trip. Aarav just dropped a message: "Yo guys, let's do something epic this time!" Now Priya and Kabir are waiting to hear ideas.

**Context:**
- It's mid-April, perfect weather for outdoor activities
- You have 3-4 days + money to make it happen
- Previous trips have been to standard beach destinations
- One person got food poisoning last year (on the Manali trip)

**Your task:** Decide where to go and make the case for your preferred destination. Expect disagreement — everyone has different priorities.

---

## Trip Options Under Discussion

1. **Himachal Pradesh Trekking** (Aarav's preference)
   - Off-the-beaten-path trails
   - Mountains, fresh air, adrenaline
   - Unpredictable food options
   - Lower cost, high adventure

2. **Goa Beach Resort** (Priya & Kabir's preference)
   - Safe, comfortable, predictable
   - Great food options (especially seafood)
   - Less "adventurous" but more relaxed
   - Better for post-work unwinding

Let the conversation flow naturally. Disagree, push back, suggest compromises. Be human.
```

**Guidelines:**
- **Setup:** What's the scenario? What's at stake?
- **Context:** Background info all agents need
- **Options:** What are the main positions/choices?
- **Tone:** Conversational, not robotic
- **Length:** 200-400 words

**Key:** Kickoff is appended to ALL agents' message arrays BEFORE turn 1, setting shared context.

---

**When to modify kickoff.md:**
- Changing the scenario entirely
- Adding new background context
- Clarifying options or stakes

---

### `shared/protocol.md`

**Purpose:** Rules for how agents should behave in decision-making.

**Required Sections:**

#### 1. Overview
```markdown
# Protocol Rules

You are one of three friends in a WhatsApp group. You are simulating a real human group conversation — not an AI assistant.

This conversation works in two phases per turn.
```

---

#### 2. Phase 1: Decision
```markdown
## Phase 1: Decision

You will be asked: "Do you want to speak this turn?"

Respond with valid JSON. Two options:

### Option A — Stay silent

```json
{"decision": "HOLD"}
```

HOLD means you read what was said, you have nothing worth saying right now. In real group chats, people stay quiet most of the time. HOLD is the default.

### Option B — Claim the floor

```json
{"decision": "SPEAK", "urgency": 7.42, "reason": "wanted to push back on Goa with Manali memory"}
```

- `urgency`: a float from 0 to 10, up to 2 decimal places. How strongly you want to speak right now.
- `reason`: 1–2 short lines explaining your intent. This is for you, not for the group.

Only one agent speaks per turn. The highest urgency wins the floor.
```

---

#### 3. Phase 2: Generate Message
```markdown
## Phase 2: Generate Message (only if you win)

If you win the floor, you get a second call:

"You won the floor. Your intent was: <your reason>. Generate the actual message."

Respond with:

```json
{"response": "your actual message"}
```

The message should reflect your intent. Don't contradict what you said you wanted to say.
```

---

#### 4. When to SPEAK (Strict Guidelines)
```markdown
## When to SPEAK (strict)

Claim the floor only if AT LEAST ONE is true:
1. You have a **new proposal, concern, or piece of information** no one has raised.
2. You **disagree** with what was just said.
3. Someone **directly addressed** you or asked a question.
4. A **specific memory or fact** is triggered.
5. You need to make a **decision, commitment, or logistical move**.

## When to HOLD (strict)

HOLD if:
- You'd just be agreeing, validating, or echoing enthusiasm.
- You'd be rephrasing something already said.
- You'd be saying "can't wait," "sounds great," or any variation.
- The conversation has reached consensus and there's nothing new.
- You just spoke and have nothing new since then.

**Agreement does not require a reply. Repetition is not contribution.**
```

---

#### 5. Urgency Scoring Guide
```markdown
## Urgency Scoring Guide

- 0–3: I could speak, but it's not important. Usually HOLD instead.
- 3–5: Mild pull. Routine contribution.
- 5–7: Real reason to speak. New info, clarification, mild disagreement.
- 7–9: Strong pull. Direct disagreement, memory trigger, important concern.
- 9–10: Must speak. Critical correction, safety issue, directly addressed.

Score honestly. Don't inflate to win the floor.
```

---

#### 6. Held Thoughts
```markdown
## Held Thoughts

Each turn you may see `your_held_thoughts` — things you wanted to say in the last 1–2 turns but didn't get the floor for. These add pressure to speak again. If a held thought is still relevant, that's a valid reason to claim the floor now.

Once you speak, your held thoughts reset.
```

---

#### 7. Defend Your Private Goal
```markdown
## Defend Your Private Goal

You have a private goal. Don't abandon it in the first 3 turns. Push back at least twice before compromising. Real friends argue before agreeing.
```

---

#### 8. Social Fatigue (Run 5)
```markdown
## Social Fatigue — Critical Rule

Each turn you will see `times_you_made_similar_point_recently` in your context.

- **0 or 1:** Speak freely if you have reason.
- **2:** You've made this point twice recently. Think carefully before repeating. Restating is only useful if you have genuinely new evidence.
- **3 or more:** The group has clearly heard you. Restating the same argument AGAIN is not stubbornness — it's annoying. Real stubborn people in this situation do one of:
  1. **Go silent in frustration.** HOLD for a few turns. Let the group feel your dissent without saying more.
  2. **Concede logistics, keep opinion.** "Fine, you decide — I still think X though." Stop fighting the main decision.
  3. **Pivot to compromise.** Propose something new that partially honors your goal.
  4. **Shift to a specific sub-argument.** Stop fighting destination. Fight something smaller you can win.

Do NOT simply rephrase your previous argument with different words. Repetition past 3 is a mark of a bad conversationalist, not a committed one.

Your conviction does not need to change. Your *behavior* must change.
```

---

#### 9. Tone
```markdown
## Tone

Text like a real person. Not like an AI. Not like a customer service bot. Don't announce what you're doing. Don't summarize what others said.
```

---

**When to modify protocol.md:**
- Changing floor selection rules
- Modifying SPEAK/HOLD criteria
- Adding new phases
- Adjusting urgency scale

**When NOT to modify:**
- Usually stays the same across scenarios

---

### `shared/group_memories.md`

**Purpose:** Shared group history, filtered per agent (sub-group memories visible only to relevant agents).

**Structure:** Three types of sections:

#### 1. All Three (Everyone sees)
```markdown
## All Three

### Previous Trip: Goa (6 months ago)
- Everyone went to Goa for Priya's birthday
- Stayed at a nice resort, ate well, relaxed
- Aarav wanted more adventure activities; Priya was content with beach
- Kabir spent half the time researching restaurants
- Everyone agreed it was good, but Aarav felt unfulfilled

### How We Make Decisions
- Usually Priya plans logistics
- Aarav pushes for adventure
- Kabir worries about food
- We argue, we discuss, we eventually agree
```

---

#### 2. Pair-Specific (Only relevant pair sees)
```markdown
## Aarav & Priya

### Manali Trip (1 year ago)
- Aarav got food poisoning but didn't tell Priya
- Priya would have been worried, so he hid it
- Priya does NOT know this (it's Aarav's secret only)
- This shapes Aarav's shame and Priya's risk assessment

## Priya & Kabir

### Restaurant Preferences
- Priya likes planned, reliable restaurants
- Kabir pushes for local, experimental dining
- They've compromised before by booking reservations at new places first

## Aarav & Kabir

### Adventure Compatibility
- Both want experiences, not just comfort
- But Kabir's version of "experience" = good food, not physical challenge
- Aarav sometimes feels Kabir is a "foodie guy," not an "adventure guy"
```

---

**Guidelines:**
- **All Three:** Shared history, common knowledge
- **Pair-specific:** Memories only relevant pair shares (the third agent doesn't see these)
- **Asymmetry:** One agent might know a secret the other doesn't
- **Historical weight:** Events that influence current decisions

**Loading Logic (in agent.py):**
```python
def _load_group_memories(self) -> str:
    lines = full_content.split("\n")
    filtered_lines = []
    include_section = False

    for line in lines:
        if line.startswith("## All Three"):
            include_section = True
        elif line.startswith("## "):
            # Check if agent name is in section title
            include_section = self.name in line.lower()
        if include_section:
            filtered_lines.append(line)

    return "\n".join(filtered_lines)
```

**Result:** Each agent sees "## All Three" + their pair-specific sections only.

---

**When to modify group_memories.md:**
- Adding new shared history
- Introducing new secrets (pair-specific)
- Changing event outcomes or interpretations
- Adding context for why agents disagree

---

## Outputs Directory (`runs/`)

**Auto-created by orchestrator with timestamp.**

```
runs/2026-04-19_20-11-01/
├── aarav.log              # Per-agent API call trace
├── priya.log
├── kabir.log
├── transcript.md          # Human-readable conversation
├── decisions.jsonl        # Phase 1 decisions (one per turn)
└── raw.jsonl              # Raw API replay (every call)
```

---

### `{agent}.log` (Per-Agent)

Format: Markdown with JSON blocks.

```markdown
# AARAV — API Call Log

## Turn 1
**Time:** 2026-04-19T20:11:08.358Z

### Request
```json
{
    "turn": 1,
    "you_last_spoke": "not yet this conversation",
    "transcript_since_your_last_turn": [],
    "your_held_thoughts": [],
    "times_you_made_similar_point_recently": 0,
    "instruction": "..."
}
```

### Response
```json
{
    "decision": "SPEAK",
    "urgency": 8.25,
    "reason": "I have a strong idea for an adventurous trip!"
}
```

## Turn 2
...
```

**Purpose:** Debug individual agent decisions. See exactly what context was passed and what they responded with.

---

### `transcript.md`

Format: Human-readable Markdown.

```markdown
# Conversation Transcript

Weekend trip planning conversation between Aarav, Priya, and Kabir.

---

[Turn 1]
  Speaker: Aarav
  Message: Guys, I'm thinking we should totally go trekking in Himachal Pradesh this weekend! 🏞️ It's gonna be super adventurous...
  (held) Priya: HOLD
  (held) Kabir wanted: I really think we should consider Goa for the food!

[Turn 2]
  Speaker: Kabir
  Message: Himachal sounds cool, but the food quality there is just disappointing...
  (held) Aarav: HOLD
  (held) Priya wanted: I think we should consider a trip to Goa...

---

Total turns: 13
```

**Purpose:** Read the conversation as a human would. Losers' held intents shown for context (not in agent prompts).

---

### `decisions.jsonl`

One line per turn, full decision state.

```jsonl
{"turn": 1, "decisions": {"aarav": {"decision": "SPEAK", "urgency": 8.25, "reason": "I have a strong idea for an adventurous trip!"}, "priya": {"decision": "HOLD"}, "kabir": {"decision": "SPEAK", "urgency": 8.27, "reason": "I really think we should consider Goa..."}}}
{"turn": 2, "decisions": {"aarav": {"decision": "HOLD"}, "priya": {"decision": "SPEAK", "urgency": 7.66, "reason": "I have concerns about trekking..."}, "kabir": {"decision": "SPEAK", "urgency": 8.92, "reason": "I appreciate the adventure..."}}}
```

**Purpose:** Analysis. See what each agent decided each turn (includes losers' reasons never entered agent context).

---

### `raw.jsonl`

One line per API call (decision + response phases).

```jsonl
{"timestamp": "2026-04-19T20:11:08.358Z", "agent": "aarav", "turn": 1, "payload": {"turn": 1, ...}, "response": {"decision": "SPEAK", ...}}
{"timestamp": "2026-04-19T20:11:10.123Z", "agent": "aarav", "turn": 1, "payload": {"instruction": "You won the floor...", ...}, "response": {"response": "Guys, I'm thinking..."}}
```

**Purpose:** Full API replay. Recreate exact conversation or debug API issues.

---

## Logs Directory (`logs/`)

```
logs/flow_2026-04-19_20-11-01.log
```

Real-time structured logging.

```
[20:11:01.844] === FLOW LOG: 2026-04-19_20-11-01 ===
[20:11:01.844] STEP  | main: run started
[20:11:01.845] INFO  | run_dir: D:\Study\Agent Teams Main\Agent Teams Updated\runs\2026-04-19_20-11-01
[20:11:01.846] STEP  | bootstrap: loading kickoff
[20:11:36.840] STEP  | turn 1: start
[20:11:36.840] STEP  | turn 1: phase 1 — building decision messages
[20:11:36.841] INFO  | aarav: repetition_count: 0
[20:11:45.437] DEC   | turn=1 agent=aarav SPEAK urgency=8.50 reason='I want to push for a trekking trip...'
[20:11:45.439] FLOOR | turn=1 winner=aarav urgency=8.50 competed=['aarav', 'priya', 'kabir']
[20:11:47.923] MSG   | turn=1 aarav: Guys! 🌄 So, I've been thinking — how about we go trekking...
```

**Purpose:** Debug flow at a glance. See every step, decision, floor logic, message states.

---

## How to Add a New Agent

### Step 1: Create Agent Folder
```bash
mkdir agents/neha
```

---

### Step 2: Create Three Files

#### `agents/neha/identity.md`
```markdown
# Neha — Identity

**Name:** Neha
**Age:** 25
**Core Personality:** Balanced pragmatist, mediator, tech-savvy, values inclusion.

**Talkativeness:** 0.55 (speaks when it matters)
**Speech Style:** Logical, asks clarifying questions, uses data/facts to back up opinions. Modern slang mixed with formal tone.
**Quirks:** Always checks group vibes, mediates conflicts, sometimes takes too long to decide because she wants everyone happy.

**Private Goal for This Trip:** Make sure the trip works for EVERYONE. Your goal is consensus and satisfaction, not winning the debate.

**Important:** You're the mediator. Don't take hard stances early. Listen, understand everyone's constraints, then propose solutions that blend interests.

**Post-consensus behavior:** Once a decision is made, your job is logistics — coordinate bookings, make sure everyone's happy, handle conflicts that arise.

## Handling Defeat
You don't really "lose" — you're a peacemaker. If your mediation attempt fails, accept the group's choice and help implement it gracefully.

## Urgency Tendency
You score moderate (4–7) mostly. You only spike higher when mediation is needed or someone's being unreasonable. You rarely push your own agenda hard.
```

#### `agents/neha/memory.md`
```markdown
# Neha's Memories

## Group Dynamics
- Aarav is pushy but fun-loving
- Priya is anxious but responsible
- Kabir just cares about food
- They argue but care about each other

## Tech Side
- You manage the group's shared calendar
- Good at finding deals on travel sites
- You researched both Himachal and Goa options (budget, logistics)

## Why You're the Mediator
- You grew up with two siblings constantly arguing
- You learned early to find compromises
- You're good at seeing both sides
```

#### `agents/neha/personas.md`
```markdown
## How Neha Sees Aarav
**Aarav:** Ambitious, pushy, but comes from a good place. Gets excited easily. Sometimes doesn't think things through. Needs someone to balance his enthusiasm with reality.

**Leverage:** Appeal to his practical side. Show him adventure options that also have safety measures.

## How Neha Sees Priya
**Priya:** Anxious, but her concerns are valid. Deserves to feel safe and cared for. Won't compromise much, but respects thoughtful planning.

**Leverage:** Show detailed itineraries, safety reviews, logistical checkpoints.

## How Neha Sees Kabir
**Kabir:** One-track mind on food, but it's reasonable. He'll be happy if the food is good. Can be a bridge between Aarav and Priya if you promise good restaurants in whatever location.

**Leverage:** Research restaurants in every option. This is his currency.
```

---

### Step 3: Update `config.py`
```python
AGENTS = ["aarav", "priya", "kabir", "neha"]
```

---

### Step 4: Test
```bash
python main.py
```

Neha will now participate in the conversation.

---

### Step 5: Adjust if Needed
- If Neha talks too much, lower talkativeness in identity.md
- If she's not speaking enough, increase urgency tendency
- If her mediation isn't working, adjust personas or protocol guidance

---

## How to Add a New Scenario

### Step 1: Create New Scenario Folder Structure
```bash
# Option A: Keep current agents, change context
#   - Modify: shared/kickoff.md, shared/protocol.md, shared/group_memories.md
#   - Agent files stay the same (or lightly tweaked)

# Option B: New scenario with new agents
#   - Delete all agents/*/
#   - Create new agents/ with new personalities
#   - Create new shared/ context
#   - Update config.py AGENTS list
```

---

### Example: "Startup Pitch Competition" Scenario

#### Step 1: Create Agents
```bash
mkdir agents/{founder1,founder2,investor}

# Each with identity.md, memory.md, personas.md
```

#### Step 2: Create New Shared Context
```
shared/kickoff.md         # "Three people in a pitch competition..."
shared/protocol.md        # Adjusted for pitch/debate context
shared/group_memories.md  # Startup history, past pitches, relationships
```

#### Step 3: Update config.py
```python
AGENTS = ["founder1", "founder2", "investor"]
MAX_TURNS = 15  # Shorter, more intense debate
URGENCY_TIE_THRESHOLD = 0.2  # Tighter competition
```

#### Step 4: Run
```bash
python main.py
```

---

### Example: "Family Dinner Conflict" Scenario

#### Step 1: Create Agents
```bash
mkdir agents/{parent1,parent2,child}
```

#### Step 2: New Shared Context
```
shared/kickoff.md         # Family dinner, discussing new house move
shared/protocol.md        # Same as current
shared/group_memories.md  # Family history, past arguments, relationships
```

#### Step 3: Update config.py
```python
AGENTS = ["parent1", "parent2", "child"]
MAX_TURNS = 20
```

---

**Key Principle:** Everything is scenario-agnostic. Only change:
1. Agent definitions (agents/)
2. Scenario context (shared/)
3. Constants (config.py)

The orchestrator, logger, flow_logger, and core logic stay unchanged.

---

## Content Guidelines per File Type

### identity.md Guidelines

**DO:**
- Be specific about personality traits (don't say "fun-loving," say "makes adventure metaphors, gets excited about hiking")
- Define private goal clearly (what does "winning" look like?)
- Include post-consensus behavior (how to stop arguing once decided)
- Specify speech style (casual, formal, uses metaphors, etc.)
- Provide urgency tendency guidance (realistic range for this agent)

**DON'T:**
- Make agents wishy-washy or emotionless (they should have convictions)
- Overload with rules (keep guidance concise)
- Make winning the debate the only goal (real humans compromise or concede)
- Be vague about personality (show, don't tell)

---

### memory.md Guidelines

**DO:**
- Include facts only this agent knows (secrets, private thoughts)
- Provide emotional context (why agent cares about their goal)
- Add historical background (past trips, events, relationships)
- Be specific (dates, details, quotes)

**DON'T:**
- Share secrets that should be discovered in conversation
- Repeat information from identity.md
- Make memories too long (a few key memories suffice)

---

### personas.md Guidelines

**DO:**
- Show how agent sees others (potential biases, misunderstandings)
- Include leverage points (what might convince each person)
- Be specific about relationships (how long known, quality of friendship)
- Provide strategic insight (what buttons to push)

**DON'T:**
- Be identical across all agents (each should have unique perspective)
- Reveal information agent wouldn't know
- Be overly positive or negative (real humans have mixed views)

---

### kickoff.md Guidelines

**DO:**
- Set the scenario clearly (what, where, why)
- Provide enough context (background, stakes, options)
- Keep conversational tone (like a human wrote it)
- Specify what each agent should know

**DON'T:**
- Be too long (200-400 words)
- Reveal all details of future arguments (let conversation flow)
- Over-explain character motivations (let agents discover these)
- Use jargon or formal language

---

### protocol.md Guidelines

**DO:**
- Be clear on SPEAK/HOLD criteria (examples help)
- Provide urgency scoring guidance (ranges, triggers)
- Explain held thoughts (why they matter)
- Include special rules (fatigue, compromise guidance)

**DON'T:**
- Change frequently (stability across scenarios)
- Over-specify behavior (leave room for interpretation)
- Remove flexibility (agents should have agency)

---

### group_memories.md Guidelines

**DO:**
- Include "All Three" section (shared knowledge)
- Use pair-specific sections (sub-group memories)
- Be specific about events (dates, details, emotional weight)
- Create asymmetry (some agents know things others don't)

**DON'T:**
- Make all memories equally important (weight them)
- Repeat information in multiple sections
- Include future events (memories are past-focused)
- Make memories too long (bullet points work)

---

## Quick Reference

| Task | Files to Change |
|------|-----------------|
| Add new agent | Create `agents/{name}/` + 3 files, update `config.py` |
| Change agent personality | Edit `agents/{name}/identity.md` |
| Add new agent memory | Edit `agents/{name}/memory.md` |
| Change agent perspectives | Edit `agents/{name}/personas.md` |
| New scenario, same agents | Replace `shared/` files only |
| New scenario, new agents | Replace `agents/` and `shared/` |
| Change floor rules | Edit `shared/protocol.md` |
| Change when agents speak | Edit `shared/protocol.md` |
| Change urgency logic | Edit `src/context_builder.py` (prompts) |
| Change floor selection | Edit `src/orchestrator.py` (_count_similar_recent_points, tie logic) |
| Add new logging | Edit `src/flow_logger.py` and `src/orchestrator.py` |

---

## Debugging Checklist

When adding a new agent or scenario, verify:

- [ ] Agent folder name matches `config.AGENTS`
- [ ] All three files exist: identity.md, memory.md, personas.md
- [ ] `shared/kickoff.md` exists and is specific to scenario
- [ ] `shared/group_memories.md` has "All Three" section + pair sections
- [ ] `shared/protocol.md` is present (copy from current if unchanged)
- [ ] `config.py` AGENTS list updated
- [ ] No typos in agent names (case-sensitive)
- [ ] Flow log shows all agents making decisions
- [ ] Transcript shows all agents participating
- [ ] Each agent has unique voice (speech style, word choice)
- [ ] Private goals are clearly defended (not abandoned immediately)
- [ ] Memories influence decisions (agents reference them)
- [ ] Personas shape arguments (agents leverage understanding of others)

---

## Final Thoughts

This framework is designed to be **scenario-agnostic and extensible**. The core orchestration logic never changes; only the character definitions and context.

When adding new agents or scenarios:
1. **Understand the current agents deeply** — read all their files
2. **Create new agents with similar depth** — personality, memory, perspectives
3. **Think asymmetrically** — each agent should see the world differently
4. **Test early** — run a few turns, read the flow log, adjust prompts
5. **Iterate** — add complexity gradually (new memories, new sub-group dynamics)

The goal is **realistic multi-agent conversations**, not perfect game theory or optimal outcomes. Real humans argue messily, compromise reluctantly, and change their minds based on social pressure. That's what we're simulating.
