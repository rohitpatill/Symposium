# Project Context — Backend Architecture & File Guide

This document is the **single source of truth** for the backend (Python orchestration engine).
For the frontend (React + Vite UI), see `agent-chat-arena-main/FRONTEND_CONTEXT.md`.

Use this as a blueprint when:
- Adding a new agent or scenario
- Modifying orchestration logic
- Debugging why a turn behaves unexpectedly
- Onboarding any agent (human or AI) onto the codebase

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Two-Phase Floor Protocol](#two-phase-floor-protocol)
3. [Project Layout](#project-layout)
4. [Root-Level Files](#root-level-files)
5. [Source Code (`src/`)](#source-code-src)
6. [Agents (`agents/`)](#agents-agents)
7. [Shared Context (`shared/`)](#shared-context-shared)
8. [Outputs (`runs/`, `logs/`)](#outputs-runs-logs)
9. [How to Add a New Agent](#how-to-add-a-new-agent)
10. [How to Add a New Scenario](#how-to-add-a-new-scenario)
11. [Modification Reference Map](#modification-reference-map)

---

## System Overview

This is a **multi-agent group conversation simulator**. N agents (≥ 2) take turns in a single
shared conversation, each with their own personality, private memories, and asymmetric view of
the others. The system simulates realistic group dynamics: not everyone speaks every turn,
agents can hold back, and a "floor protocol" decides who actually gets to talk.

The system is **scenario-agnostic** — the orchestration engine works for any agent count and
any topic. Scenarios are defined entirely by data files (markdown).

There are two ways to run a conversation:

| Mode | Entry point | Use case |
|------|------------|----------|
| **CLI** | `python main.py` | Run a full conversation start to finish, files written at end |
| **Server** | `python server.py` (FastAPI on port 8000) | Backend for the React UI; turn-by-turn over HTTP |

Both share the same `Orchestrator` class. Outputs are written to `runs/<timestamp>/` after **every turn** in both modes.

---

## Two-Phase Floor Protocol

Every turn runs **Phase 1 (parallel)** followed by **Phase 2 (single-speaker)**:

### Phase 1 — Decision (parallel)

All agents are called concurrently with `asyncio.gather`. Each one returns:

```json
{"decision": "HOLD", "inner_thought": "<private inner monologue>"}
```
or
```json
{"decision": "SPEAK", "urgency": 7.43, "inner_thought": "<private inner monologue>"}
```

- `inner_thought` is **private introspection**, never shown to other agents. It is what the
  agent is thinking to itself ("I think...", "I'm worried...", "They don't realize..."), NOT
  what they would say out loud.
- `urgency` is a precise float (e.g. 7.43, not 7.5). The prompt explicitly forbids round numbers.

### Floor selection (no LLM involved)

Pure Python logic in `orchestrator.py`:

1. Filter agents with `decision == "SPEAK"`.
2. Apply **consecutive-speaker penalty** to each speaker's raw urgency:
   - 0 prior consecutive wins → multiplier 1.00 (no penalty)
   - 1 prior win → 0.85
   - 2 prior wins → 0.65
   - 3+ prior wins → 0.40 (heavy penalty)
3. Pick the agent with the **highest effective urgency**. On exact ties, random.
4. Losers' inner thoughts are **not** broadcast — they live only in each agent's private
   `thought_history`.

### Phase 2 — Spoken message (winner only)

The winner is called a second time with their `inner_thought` injected. They produce:

```json
{"response": "<the actual outward message they say to the group>"}
```

The spoken message can differ in tone/wording from the inner thought — the inner thought is
private, the response is public.

### Termination

A run ends when **any** of these is true:
- `MAX_TURNS` reached (default 20)
- `ALL_HOLD_TERMINATION` consecutive turns of all-HOLD (default 2)

---

## Project Layout

```
Agent Teams Updated/
├── main.py                       # CLI entry point
├── server.py                     # FastAPI server (frontend backend)
├── config.py                     # All knobs and constants
├── requirements.txt
├── .env                          # API key (Bearer token, gitignored)
├── .claude/
│   └── settings.json             # Project-scope Claude permissions
│
├── CONTEXT.md                    # ← this file (backend guide)
├── CLAUDE.md                     # Quick-reference summary
├── PROJECT_STRUCTURE.md          # Historical layout doc
├── SYSTEM_CONTEXT.md             # Historical design doc
├── RUN2_CONTEXT.md, RUN4_CONTEXT.md, RUN5_SPEC.md   # Iteration notes
│
├── src/
│   ├── agent.py                  # Agent class (one per participant)
│   ├── orchestrator.py           # Turn loop, floor selection, penalty
│   ├── context_builder.py        # Phase 1 prompt + transcript formatting
│   ├── logger.py                 # Per-run output files
│   ├── flow_logger.py            # Real-time structured trace
│   └── __init__.py
│
├── agents/                       # One folder per agent (any count, any names)
│   └── <agent>/
│       ├── identity.md           # Required: personality, goals, tone
│       ├── memory.md             # Optional: private memories
│       └── personas.md           # Optional: views of others
│
├── shared/
│   ├── kickoff.md                # Scene/topic (turn 0 user message)
│   ├── protocol.md               # Inner-thought + SPEAK/HOLD rules
│   └── group_memories.md         # Optional: shared/pair-level history
│
├── runs/<timestamp>/             # Auto-created per run
│   ├── <agent>.log               # Full API trace per agent
│   ├── transcript.md             # Human-readable conversation
│   ├── decisions.jsonl           # Phase 1 decisions per turn
│   └── raw.jsonl                 # Every API call (for replay)
│
├── logs/flow_<timestamp>.log     # Real-time flow trace
│
└── agent-chat-arena-main/        # React + Vite frontend (see FRONTEND_CONTEXT.md)
```

---

## Root-Level Files

### `main.py`
**Purpose:** CLI entry point.
**Flow:** Load env → create timestamped `runs/<ts>/` dir → init flow logger → instantiate
`Orchestrator` → call `await orchestrator.run()` (loops `run_turn()` until termination).
**Modify when:** You want a different startup behavior (rare). Don't touch for new agents/scenarios.

### `server.py`
**Purpose:** FastAPI server for the React frontend.
**Endpoints:**
- `POST /api/reset` — creates a new `runs/<ts>/` dir, instantiates Orchestrator, calls `bootstrap()`. Returns ok.
- `POST /api/turn` — calls `orchestrator.run_turn()`, returns `{"continue": bool, "data": {...}}`.
- `GET /api/config` — parses agent identity files, returns `{agents: {...}, kickoff: "..."}` for the UI.

The server holds a single `global_orchestrator` between calls (single-session model).

CORS is open (`*`) — adjust for production.
Run: `python server.py` → listens on `127.0.0.1:8000` with auto-reload.

### `config.py`
**Purpose:** Single configuration surface. Every tunable knob lives here.

| Constant | Default | Meaning |
|----------|---------|---------|
| `MODEL` | `"gpt-4o-mini"` | OpenAI model |
| `API_URL` | `https://api.openai.com/v1/responses` | Endpoint (NOT chat completions) |
| `API_KEY` | from `.env` | Full `Bearer sk-...` string |
| `AGENTS` | auto-discovered | List of agent folder names found in `agents/` |
| `MAX_TURNS` | 20 | Hard cap |
| `ALL_HOLD_TERMINATION` | 2 | Stop after N all-HOLD turns |
| `MAX_THOUGHT_HISTORY` | 2 | How many recent inner thoughts each agent sees of *its own* (Option A) |
| `DECISION_MAX_TOKENS` | 200 | Phase 1 budget |
| `RESPONSE_MAX_TOKENS` | 500 | Phase 2 budget |
| `CONSECUTIVE_SPEAKER_PENALTY` | True | Master flag for penalty system |
| `CONSECUTIVE_PENALTY_MULTIPLIERS` | `{0:1.0, 1:0.85, 2:0.65, 3:0.40}` | Multiplier indexed by prior consecutive wins |
| `AGENTS_DIR`, `SHARED_DIR`, `RUNS_DIR` | absolute paths | Auto-derived from this file's location |

**Agent discovery:** `AGENTS` is auto-populated from subfolders of `agents/` — you add a new agent
just by creating its folder. No need to list it here.

**Deprecated/removed (do not re-add):**
- `URGENCY_TIE_THRESHOLD` — removed; replaced by exact-tie randomization on effective urgency
- `MAX_HELD_THOUGHTS` — replaced by `MAX_THOUGHT_HISTORY`
- Hardcoded scenario theme keywords / memory triggers — fully removed

### `.env`
Single line:
```
OPENAI_API_KEY=Bearer sk-proj-XXXXXXXX...
```
The literal `Bearer ` prefix is required (passed as the full Authorization header value).
Protected by `.claude/settings.json` against accidental reads.

### `requirements.txt`
- `requests` — used by `agent.py` for HTTP POSTs
- `python-dotenv` — for `.env` loading
- `fastapi` + `uvicorn` — server mode
- (optional) `httpx` — historical, currently unused

---

## Source Code (`src/`)

All code under `src/` is **scenario-agnostic**. It works for any number of agents (2 to N) with
any topic. Adding/removing agents needs zero code changes.

### `src/agent.py`

#### `class Agent`

Represents one participant. Holds its persistent message history and private state.

**Constructor `Agent(name)`:**
- Loads `agents/<name>/identity.md` (required)
- Loads `agents/<name>/memory.md` (optional, returns "" if missing)
- Loads `agents/<name>/personas.md` (optional)
- Loads `shared/group_memories.md` and **filters** to sections this agent belongs to
  (top-level + any heading containing the agent's name + any "all/everyone/shared/group" heading)
- Loads `shared/protocol.md`
- Concatenates all into `self.system_prompt` (skipping empty optional sections)
- Initializes `self.messages = [{"role": "system", "content": system_prompt}]`
- Initializes `self.thought_history = []` (last N entries: `{turn, spoke, thought}`)

**Key methods:**

| Method | Purpose |
|--------|---------|
| `append_user_message(content)` | Add user message to history |
| `append_assistant_message(content)` | Add assistant message to history |
| `record_thought(turn, spoke, thought)` | Append to `thought_history`, capped at `MAX_THOUGHT_HISTORY` |
| `call_decision()` (async) | Phase 1 API call, returns parsed `{decision, urgency, inner_thought, ...}` |
| `call_response(inner_thought)` (async) | Phase 2 API call (winner only); injects intent, returns `{response, ...}` |
| `_post(max_tokens)` | HTTP POST to `/v1/responses` |
| `_build_input_list()` | Converts `self.messages` to OpenAI `/v1/responses` input format |
| `_extract_text(api_response)` | Extracts `output[0].content[0].text` |

**Phase 1 invariant:** every `call_decision()` appends exactly one assistant message.
**Phase 2 invariant:** every `call_response()` appends one user message (intent injection) + one assistant message.

**Backward-compat:** decision parsing accepts both `inner_thought` (current) and `reason` (legacy) keys
from the model. Output dict carries both for the frontend.

**API payload format (`/v1/responses`):**
```json
{
  "model": "gpt-4o-mini",
  "input": [
    {"role": "user",      "content": [{"type": "input_text", "text": "..."}]},
    {"role": "assistant", "content": [{"type": "output_text","text": "..."}]}
  ],
  "max_output_tokens": 200,
  "text": {"format": {"type": "json_object"}}
}
```
Note: system role is converted to user role on the way out (this endpoint quirk).
JSON output is enforced at the API level.

**Modify when:** you change message structure, API format, or per-agent state.
**Do NOT modify when:** changing agent personality (use markdown files) or floor logic (use orchestrator).

### `src/orchestrator.py`

#### `class Orchestrator`

The turn loop and floor protocol. Stateless across turns except for what's stored on `self`.

**State:**
| Field | Type | Meaning |
|-------|------|---------|
| `agents` | `dict[str, Agent]` | One per name in `config.AGENTS` |
| `logger` | `Logger` | Output file writer |
| `turn` | `int` | Current turn number |
| `consecutive_all_hold` | `int` | Counter for all-HOLD termination |
| `last_spoke` | `dict[str, int]` | Last turn each agent spoke (0 = never) |
| `shared_transcript` | `list` | `[{turn, speaker, message}]` — actual spoken messages |
| `consecutive_wins` | `dict[str, int]` | Per-agent consecutive-win counter for penalty |

**Methods:**

`bootstrap()`: loads `kickoff.md`, appends as user message to all agents, seeds shared
transcript with turn 0 entry from "Narrator".

`run_turn() -> {"continue": bool, "data": {...}}`:

1. **Phase 1 build:** for each agent, call `build_decision_user_message(...)` with:
   - turn number, when they last spoke
   - shared transcript slice since their last turn
   - their **own** thought_history (private to them)

2. **Phase 1 call:** `asyncio.gather(*[a.call_decision() for a in agents])`. Parallel.

3. **Apply penalty:** `_apply_penalty(name, raw_urgency)` → returns
   `{effective_urgency, penalty_multiplier, penalty_delta, consecutive_wins_before, penalty_reason}`.
   Mirrored to `decisions[name]`. Also mirrors `inner_thought` into `reason` for frontend backcompat.

4. **Floor selection:** `max(effective_urgency)` over speakers, exact-tie random.
   Update `consecutive_wins`: winner +1, all others reset to 0.
   Reset to 0 for everyone on all-HOLD.

5. **Record thoughts (Option A):** call `record_thought(turn, spoke=is_winner, thought=...)`
   for **every** agent (winners and holders alike). This is the agent's private memory of
   what it was thinking — never shared.

6. **Phase 2:** if anyone spoke, winner's `call_response(inner_thought)` produces the message.
   Append to shared transcript. Update `last_spoke`.

7. **Logging:** structured logs to `logger`, real-time trace to `flow_logger`,
   then `logger.write_files()` (idempotent, runs every turn).

8. Return `{"continue": turn < MAX_TURNS, "data": {turn, winner, message, decisions}}`.

`run()`: CLI loop. Calls `bootstrap()` then `run_turn()` until `continue == False`.

**Helper functions:**
- `_transcript_since(last_turn)` — returns shared transcript entries strictly after a given turn
- `_penalty_multiplier(consecutive_wins)` — looks up multiplier with safe fallback to highest tier
- `_apply_penalty(name, raw_urgency)` — assembles full penalty info dict

**Modify when:** changing floor selection, penalty logic, termination conditions, or adding new state.
**Do NOT modify when:** changing prompts (use `context_builder.py`) or agent files.

### `src/context_builder.py`

Pure functions — no class, no state.

#### `build_decision_user_message(turn_num, agent_name, you_last_spoke, transcript_since_last_turn, thought_history) -> str`

Returns a JSON string containing:
```json
{
  "turn": 5,
  "you_last_spoke": "turn 3",
  "transcript_since_your_last_turn": [{"turn": 4, "speaker": "Jax", "message": "..."}],
  "your_recent_inner_thoughts": [
    {"turn": 3, "spoke": true, "thought": "..."},
    {"turn": 4, "spoke": false, "thought": "..."}
  ],
  "instruction": "<long instruction with examples>"
}
```

The **instruction** is the heart of the system. It explicitly distinguishes inner thought from
outward message, with concrete good/bad examples. Updating this is prompt engineering — do it
deliberately and re-run to verify behavior.

#### `format_transcript_for_log(turn_num, winner, winner_message, decisions, agent_order) -> str`

Renders one turn for the human-readable transcript:
```
[Turn 5]
  Speaker: Jax
  Message: Listen, the thrusters are shot...
  (thought, spoke) Jax: I have to press this point.
  (thought, held back) Nova: I should keep pushing my research.
  (thought, HOLD) Chen: I'll wait — Reyes seems to lead.
```

**Modify when:** changing what context agents see (decision payload) or transcript format.

### `src/logger.py`

#### `class Logger`

Persists run outputs. Idempotent — `write_files()` is called after every turn.

| Output file | Format | Contents |
|-------------|--------|----------|
| `<agent>.log` | Markdown + JSON blocks | Per-agent: every API request/response with timestamps |
| `transcript.md` | Markdown | Human-readable conversation, scenario-agnostic header (uses dynamic agent names) |
| `decisions.jsonl` | JSONL | One line per turn: `{turn, decisions: {<name>: {decision, urgency, effective_urgency, penalty_multiplier, ...}}}` |
| `raw.jsonl` | JSONL | One line per API call: `{timestamp, agent, turn, payload, response}` |

**Modify when:** adding new output formats or changing what's recorded. Rare.

### `src/flow_logger.py`

Real-time structured tracing for debugging. Writes to `logs/flow_<timestamp>.log`.

```
[10:27:46.264] FLOOR | turn=1 winner=nova urgency=9.85 competed=['chen','jax','nova','reyes','rook']
[10:27:46.265] STEP  | turn 1: phase 2 — nova generating response
```

Functions:
| Function | Use |
|----------|-----|
| `init(timestamp)` | Open log file (called by `main.py` and `server.py`) |
| `step(label)` | Major step marker |
| `info(label, data)` | Arbitrary data dump |
| `ok(label)` | Success |
| `warn(label)` | Warning (e.g. all-HOLD) |
| `error(label, exc)` | Error (with optional exception) |
| `decision(turn, name, decision, urgency, inner_thought)` | One-line decision summary |
| `floor(turn, winner, urgency, all_speakers)` | Floor selection result |
| `message(turn, speaker, text)` | Spoken message |
| `agent_messages_state(name, messages)` | Snapshot of agent's message array |

---

## Agents (`agents/`)

Each subfolder = one agent. Folder name = agent's identifier (lowercase, no spaces).
The `config.AGENTS` list is auto-populated from these folders.

### Required: `<agent>/identity.md`

Defines personality, goal, speech style, urgency tendency. The most important file per agent.

**Recommended sections** (none are technically required, but all together produce best results):

1. **Header** — `**Name:**`, `**Age:**`, `**Core Personality:**`
2. **Communication Profile** — `**Talkativeness:** 0.0–1.0`, `**Speech Style:**`, `**Quirks:**`
3. **Private Goal** — what they want from the conversation
4. **Important** — explicit guidance ("Push back at least twice before compromising")
5. **Post-consensus behavior** — what to do after the group decides
6. **Handling Defeat** — options when their conviction loses (go silent, concede logistics, pivot, sub-argument)
7. **Urgency Tendency** — typical range for this agent (extroverts 5–9, introverts 3–6, passion spikes 9–10)
8. **What He/She Values** — core values
9. **Special Rules** — agent-specific quirks ("No emojis. Ever.", "Speak less than the others.")

### Optional: `<agent>/memory.md`

Free-form private memories only this agent can see. Personal facts, secrets, opinions about
others (uncensored), historical context, vulnerabilities. Influences the system prompt — never
quoted to other agents.

If missing, the section is silently skipped.

### Optional: `<agent>/personas.md`

This agent's **subjective** view of every other agent. Asymmetric on purpose — Aarav's view of
Priya ≠ Priya's view of Aarav. Should include:
- How they see this person (potentially biased, can be wrong)
- Closeness / Trust / Irritation (0.0–1.0 each)
- Shared memories
- Typical dynamic
- Leverage points (what would actually convince this person)

If missing, silently skipped.

---

## Shared Context (`shared/`)

### `shared/kickoff.md`

The opening scene. Loaded once at bootstrap, appended as the first user message to every agent
and seeded into the shared transcript as turn 0 from "Narrator".

200–400 words. Conversational tone. Set the scenario, the stakes, the options. Don't reveal
arguments — let them emerge.

### `shared/protocol.md`

The hard rules every agent sees in their system prompt. This is what tells them:
- The decision JSON format (HOLD vs SPEAK)
- That `inner_thought` is private monologue, NOT a pitch (with concrete examples)
- The Phase 2 spoken-message vs inner-thought distinction
- When to SPEAK vs HOLD (strict criteria)
- Urgency scoring guide (0–10 with bands)
- That `your_recent_inner_thoughts` are their own private memory across turns
- To defend their private goal at least twice before compromising

**Stable across scenarios.** Don't rewrite per-scenario unless the protocol itself changes.

### `shared/group_memories.md` (optional)

Shared history. Filtered per agent at load time:
- Top-level content (before any `## ` heading) → always shown
- A `## Heading` is included if it contains the agent's name OR words like
  "all", "everyone", "shared", "group"
- Otherwise excluded (e.g. pair memories the agent isn't part of)

This lets you encode asymmetric group history: e.g. an Aarav+Priya secret only those two see.

---

## Outputs (`runs/`, `logs/`)

### `runs/<timestamp>/`
Auto-created per run. Contents written **after every turn** (not just at end), so server-mode
runs always have current state on disk.

- `<agent>.log` — full per-agent API traces
- `transcript.md` — human-readable
- `decisions.jsonl` — Phase 1 decisions including penalty fields
- `raw.jsonl` — every API call for replay

### `logs/flow_<timestamp>.log`
Real-time structured trace, separate from per-run outputs. Useful for debugging across runs.

---

## How to Add a New Agent

1. **Create folder:** `agents/<name>/` (lowercase, matches your desired display name)
2. **Required:** `agents/<name>/identity.md` (use sections listed above)
3. **Optional:** `agents/<name>/memory.md`, `agents/<name>/personas.md`
4. **Optional:** add this agent to existing pairs/groups in `shared/group_memories.md`
5. **Run:** `python main.py` — `config.AGENTS` is auto-populated; no config edit needed

**Sanity check:** the flow log will show this agent making a decision on turn 1. If they're
absent, check the folder name has no typo and `identity.md` exists.

---

## How to Add a New Scenario

Two paths:

### Same agents, new context
- Edit `shared/kickoff.md` to set up the new scene
- Optionally edit `shared/group_memories.md` for new shared history
- Lightly update each agent's `identity.md` (private goal must reflect the new scenario)
- `protocol.md` stays unchanged

### New agents, new context
- Delete `agents/*/` (or move them aside)
- Create new agents per "How to Add a New Agent" steps
- Replace `shared/kickoff.md` and `shared/group_memories.md`
- `protocol.md` stays unchanged unless the protocol itself changes
- Update `config.MAX_TURNS` if needed (longer/shorter conversations)

The orchestrator, logger, agent class, and protocol stay the same. Everything you change is data.

---

## Modification Reference Map

| If you want to… | Edit |
|-----------------|------|
| Add a new agent | Create `agents/<name>/identity.md` (+ optional `memory.md`, `personas.md`) |
| Change agent personality | `agents/<name>/identity.md` |
| Add private agent memories | `agents/<name>/memory.md` |
| Change how an agent sees others | `agents/<name>/personas.md` |
| Change the conversation topic | `shared/kickoff.md` |
| Change SPEAK/HOLD rules or urgency guidance | `shared/protocol.md` |
| Add shared/pair group history | `shared/group_memories.md` |
| Tune turn limits, model, penalty multipliers | `config.py` |
| Change Phase 1 decision prompt structure | `src/context_builder.py` |
| Change floor selection or penalty logic | `src/orchestrator.py` (`_apply_penalty`, floor selection) |
| Change API payload format | `src/agent.py` (`_post`, `_build_input_list`) |
| Add a new output file format | `src/logger.py` (`write_files`) |
| Add a new flow log line type | `src/flow_logger.py` |
| Change the FastAPI surface (new endpoint, etc.) | `server.py` |

---

## Debugging Checklist

If something doesn't behave as expected, in order:

1. **Flow log** (`logs/flow_<ts>.log`) — verify all agents made decisions, see who won the floor
2. **Per-agent log** (`runs/<ts>/<agent>.log`) — see exactly what context they got and what they returned
3. **decisions.jsonl** — see all Phase 1 decisions including penalty effects (raw vs effective urgency)
4. **transcript.md** — read it like a human, spot if anyone is repeating themselves or talking past others

Common issues and where to look:
- **An agent never speaks** → Check `identity.md` urgency tendency; check protocol's HOLD criteria isn't being misapplied
- **Same agent dominates** → Check `consecutive_wins` is incrementing in the flow log; check `CONSECUTIVE_PENALTY_MULTIPLIERS`
- **Inner thoughts look like pitches** → The Phase 1 instruction in `context_builder.py` needs sharper examples
- **Files not written to runs/** → Verify `logger.write_files()` is called after every turn (already wired)
- **Frontend not updating** → See `agent-chat-arena-main/FRONTEND_CONTEXT.md`

---

## Design Principles (don't violate without thought)

1. **LLMs never see urgency.** Score selection is purely mechanical. Keep it that way.
2. **Inner thought is private.** The transcript only ever contains spoken messages.
3. **Asymmetry is the point.** Each agent has its own subjective world model.
4. **Scenario-agnostic code.** No agent names hardcoded in `src/`. Themes loaded from data.
5. **Idempotent writes.** `write_files()` overwrites cleanly — safe to call after every turn.
6. **Optional files stay optional.** `memory.md` and `personas.md` can be missing.
7. **N-agent generality.** Code works for any N ≥ 2 — no magic constants tied to "3 friends".
