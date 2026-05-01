# Backend Context — Orchestration Engine & Managed Mode

This document is the **single source of truth** for the Python backend that powers both the classic simulation CLI and the Managed Mode team builder. For the frontend (React + Vite UI), see `agent-chat-arena-main/FRONTEND_CONTEXT.md`.

Use this when:
- Adding new agents or scenarios
- Modifying orchestration logic or floor selection
- Debugging turn behavior
- Integrating new LLM providers
- Building or extending Managed Mode features (teams, conversations, team builder AI)

---

## Quick Reference

| Mode | Entry | Use Case |
|------|-------|----------|
| **CLI** | `python main.py` | Run full conversation, write outputs to `runs/<timestamp>/` |
| **Server** | `python server.py` | FastAPI backend for React UI; turn-by-turn over HTTP |

Both share the same `Orchestrator` class. Managed Mode endpoints use SQLite (`arena.db`) for persistence.

---

## Project Layout

```
Agent Teams Updated/
├── main.py                       # CLI entry point (classic mode)
├── server.py                     # FastAPI server (Managed Mode + classic API)
├── config.py                     # All tunable constants
├── db.py                         # SQLite schema + query helpers
├── CONTEXT.md                    # ← this file (backend guide)
├── CLAUDE.md                     # Quick reference
├── requirements.txt
├── .env                          # API keys (gitignored)
│
├── src/
│   ├── agent.py                  # Agent class (personality, messages, API calls)
│   ├── orchestrator.py           # Turn loop, floor selection, penalty
│   ├── context_builder.py        # Phase 1 prompt construction
│   ├── logger.py                 # Per-run output files
│   ├── flow_logger.py            # Real-time structured trace
│   ├── providers/
│   │   ├── base.py               # Provider interface
│   │   ├── openai_provider.py    # OpenAI /v1/responses API
│   │   ├── gemini_provider.py    # Google Gemini API
│   │   ├── anthropic_provider.py # Anthropic API
│   │   ├── factory.py            # Provider factory
│   │   └── registry.py           # Provider catalog
│   └── __init__.py
│
├── agents/                       # One folder per agent (auto-discovered)
│   └── <agent>/
│       ├── identity.md           # Required: personality + goals
│       ├── memory.md             # Optional: private memories
│       └── personas.md           # Optional: subjective views of others
│
├── shared/
│   ├── kickoff.md                # Scene/scenario (turn 0)
│   ├── protocol.md               # Floor rules + inner-thought guidance
│   └── group_memories.md         # Optional: shared/pair-level history
│
├── runs/<timestamp>/             # Auto-created per run
│   ├── <agent>.log               # Full API trace per agent
│   ├── transcript.md             # Human-readable conversation
│   ├── decisions.jsonl           # Phase 1 decisions + penalty
│   └── raw.jsonl                 # Every API call (replayable)
│
├── logs/flow_<timestamp>.log     # Real-time flow trace
│
└── agent-chat-arena-main/        # React + Vite frontend (see FRONTEND_CONTEXT.md)
```

---

## Configuration (`config.py`)

All tunable knobs in one place. No hardcoded values in code.

### API & Providers

| Key | Default | Meaning |
|-----|---------|---------|
| `OPENAI_API_KEY` | from `.env` | OpenAI key |
| `GEMINI_API_KEY` | from `.env` | Google Gemini key |
| `ANTHROPIC_API_KEY` | from `.env` | Anthropic key |
| `DEFAULT_PROVIDER` | auto-detect | Provider to use (openai, gemini, anthropic) |
| `DEFAULT_MODEL` | model per provider | Default LLM (gpt-4o-mini, gemini-3.1-flash-lite-preview, claude-opus) |

### Orchestration

| Key | Default | Meaning |
|-----|---------|---------|
| `MAX_TURNS` | 20 | Hard stop on conversation length |
| `ALL_HOLD_TERMINATION` | 2 | Stop after N consecutive all-HOLD turns |
| `MAX_THOUGHT_HISTORY` | 2 | Per-agent inner thoughts visible (own thoughts only) |
| `DECISION_MAX_TOKENS` | 200 | Phase 1 budget per agent |
| `RESPONSE_MAX_TOKENS` | 500 | Phase 2 budget (winner only) |

### Floor Selection & Penalty

| Key | Default | Meaning |
|-----|---------|---------|
| `CONSECUTIVE_SPEAKER_PENALTY` | True | Enable penalty system |
| `CONSECUTIVE_PENALTY_MULTIPLIERS` | `{0:1.0, 1:0.85, 2:0.65, 3:0.40}` | Multiplier by prior wins |

### Paths (auto-derived)

| Key | Meaning |
|-----|---------|
| `AGENTS_DIR` | Agents folder |
| `SHARED_DIR` | Shared context folder |
| `RUNS_DIR` | Output runs folder |
| `DB_PATH` | SQLite database |

---

## Two-Phase Floor Protocol

Every turn: **Phase 1 (parallel decisions)** → **Floor selection** → **Phase 2 (winner speaks)**

### Phase 1 — Decision (Parallel)

All agents called concurrently. Each returns JSON:

```json
{
  "decision": "HOLD",
  "inner_thought": "I think..."
}
```

or

```json
{
  "decision": "SPEAK",
  "urgency": 7.43,
  "inner_thought": "I feel compelled to..."
}
```

- **`inner_thought`** — private introspection (never shown to other agents)
- **`urgency`** — precise float (e.g., 7.43, not 7.5); range 0–10

### Floor Selection (Mechanical)

Pure Python logic in `orchestrator.py`:

1. Filter agents with `decision == "SPEAK"`
2. Apply **consecutive-speaker penalty**:
   - 0 prior wins → 1.00× (no penalty)
   - 1 prior win → 0.85×
   - 2 prior wins → 0.65×
   - 3+ prior wins → 0.40× (heavy penalty)
3. Pick highest **effective urgency**; exact ties broken by random selection
4. Update **consecutive_wins** counter (winner +1, others reset to 0)
5. Reset counter on all-HOLD turns

### Phase 2 — Spoken Message (Winner Only)

Winner called again with their `inner_thought` injected. Returns:

```json
{
  "response": "Listen, I think we need to..."
}
```

The **spoken message differs from inner thought** — private introspection vs. public pitch.

### Termination

Run ends when **any** of:
- `turn >= MAX_TURNS` (default 20)
- `ALL_HOLD_TERMINATION` consecutive all-HOLD turns (default 2)

---

## Source Code (`src/`)

All code is **scenario-agnostic** and **N-agent generic**. No hardcoded agent names or counts.

### `src/agent.py`

#### `class Agent`

One participant. Holds personality, message history, thought history.

**Constructor `Agent(name, context_override=None)`:**
- Loads `agents/<name>/identity.md` (required)
- Loads `agents/<name>/memory.md` (optional, "" if missing)
- Loads `agents/<name>/personas.md` (optional, "" if missing)
- Loads `shared/protocol.md`
- Loads and **filters** `shared/group_memories.md`:
  - Top-level content always included
  - Heading included if contains agent name OR "all"/"everyone"/"shared"/"group"
  - Pair memories excluded if agent not in heading
- Builds `system_prompt` (identity + how-you-see-others + memories + group-context + protocol)
- Initializes `messages = [{"role": "system", "content": system_prompt}]`
- Initializes `thought_history = []` (last N turns' inner thoughts, capped at `MAX_THOUGHT_HISTORY`)

**Key methods:**

| Method | Purpose |
|--------|---------|
| `append_user_message(content)` | Append user message |
| `append_assistant_message(content)` | Append assistant message |
| `record_thought(turn, spoke, thought)` | Record inner thought (capped at `MAX_THOUGHT_HISTORY`) |
| `call_decision()` (async) | Phase 1 API call → `{decision, urgency, inner_thought}` |
| `call_response(inner_thought)` (async) | Phase 2 API call (winner only) → `{response}` |
| `_post(max_tokens)` | HTTP POST to LLM provider |

**Managed Mode override:** `context_override` dict allows injecting custom identity/memory/personas/provider without loading files. Used by team builder.

### `src/orchestrator.py`

#### `class Orchestrator`

Turn loop and floor protocol. Stateful between turns.

**State:**

| Field | Type | Meaning |
|-------|------|---------|
| `agents` | `dict[str, Agent]` | All agents |
| `turn` | `int` | Current turn number |
| `consecutive_all_hold` | `int` | Counter for all-HOLD termination |
| `last_spoke` | `dict[str, int]` | Last turn each agent spoke |
| `shared_transcript` | `list` | `[{turn, speaker, message}]` — spoken only |
| `consecutive_wins` | `dict[str, int]` | Per-agent consecutive-win counter |

**Methods:**

`bootstrap()`: Load kickoff.md, append to all agents, seed transcript with turn 0 (Narrator).

`run_turn() -> {"continue": bool, "data": {...}}`:

1. **Phase 1 build:** For each agent, construct decision prompt with:
   - Current turn number
   - When they last spoke
   - Shared transcript slice since their last turn
   - Their own `thought_history` (private)

2. **Phase 1 call:** `asyncio.gather()` — all agents call `call_decision()` in parallel

3. **Apply penalty:** For each speaker, compute `effective_urgency = raw_urgency × multiplier`

4. **Floor selection:** Pick agent with highest `effective_urgency` (random tie-break)

5. **Record thoughts:** For **every** agent (speakers + holders), call `record_thought()`. Private memory.

6. **Phase 2:** If winner exists, call winner's `call_response()`, append to shared transcript

7. **Logging:** Write to flow logger, per-run logger, call `logger.write_files()` (idempotent)

8. Return `{"continue": not terminated, "data": {turn, winner, message, decisions}}`

`run()`: CLI loop. Call `bootstrap()` then `run_turn()` until `continue == False`.

### `src/context_builder.py`

Pure functions. Construct Phase 1 decision prompt.

`build_decision_user_message(turn_num, agent_name, you_last_spoke, transcript_since_last_turn, thought_history) -> str`

Returns JSON:

```json
{
  "turn": 5,
  "you_last_spoke": "turn 3",
  "transcript_since_your_last_turn": [...],
  "your_recent_inner_thoughts": [...],
  "instruction": "<explicit guidance with examples>"
}
```

The **instruction** is the core prompt. Distinguishes inner thought from spoken message with concrete examples. Update carefully.

### `src/providers/`

Multi-provider LLM abstraction.

**Files:**
- `base.py` — `ProviderBase` interface
- `openai_provider.py` — OpenAI `/v1/responses` endpoint
- `gemini_provider.py` — Google Gemini API
- `anthropic_provider.py` — Anthropic API
- `factory.py` — `get_provider(type)` factory
- `registry.py` — `PROVIDER_CATALOG` (names + models)

Each provider must implement:
- `generate_json(api_key, model, system_prompt, messages, max_tokens, **kwargs) -> {"text": str, "usage": dict}`
- Model validation + error handling

### `src/logger.py`

Idempotent output writer. Calls `write_files()` after every turn.

**Output files in `runs/<timestamp>/`:**

| File | Format | Contents |
|------|--------|----------|
| `<agent>.log` | Markdown | Per-agent API trace with timestamps |
| `transcript.md` | Markdown | Human-readable conversation |
| `decisions.jsonl` | JSONL | One line per turn: decisions + penalty fields |
| `raw.jsonl` | JSONL | Every API call (replayable) |

### `src/flow_logger.py`

Real-time structured tracing for debugging. Writes to `logs/flow_<timestamp>.log`.

```
[10:27:46.264] FLOOR | turn=1 winner=nova urgency=9.85
[10:27:46.265] STEP  | turn 1: phase 2 — nova generating response
```

Functions: `init()`, `step()`, `decision()`, `floor()`, `message()`, `info()`, `warn()`, `error()`

---

## Database (`db.py`)

SQLite schema for Managed Mode persistence.

**Key tables:**

| Table | Purpose |
|-------|---------|
| `teams` | Team metadata (id, name, description, created_at) |
| `llm_provider_configs` | Provider keys (id, provider_type, api_key, is_valid) |
| `team_agents` | Agents in teams (id, team_id, slug, personality fields, model_id) |
| `team_agent_memories` | Per-agent memories (id, team_agent_id, type, target_agent_slug, title, content) |
| `team_group_memories` | Shared memories (id, team_id, title, content, participant_slugs, is_general) |
| `conversations` | Launched conversations (id, team_id, title, status, settings_json, created_at) |
| `conversation_messages` | Chat messages (id, conversation_id, turn, speaker, text, timestamp) |
| `conversation_decisions` | Phase 1 decisions (id, conversation_id, turn, agent_slug, decision_json) |

**Key helpers:**
- `init_db()` — Create schema
- `get_conn()` — Context manager (auto-commit)
- `encrypt_secret()` / `decrypt_secret()` — Windows DPAPI for API keys
- `slugify()` — Convert display names to slugs
- `parse_markdown_sections()` — Extract markdown headings

---

## FastAPI Server (`server.py`)

**CORS:** Open (`*`). Tighten for production.

**Managed Mode endpoints:**

### Team Management
- `GET /api/managed/teams` — List all teams
- `POST /api/managed/teams` — Create team
- `GET /api/managed/teams/{id}` — Get team detail
- `PUT /api/managed/teams/{id}` — Update team
- `DELETE /api/managed/teams/{id}` — Delete team

### Provider Management
- `GET /api/managed/providers` — List provider configs + catalog
- `POST /api/managed/providers` — Save + validate provider key
- `DELETE /api/managed/providers/{id}` — Delete provider

### Team Builder (Symposium AI)
- `POST /api/managed/team-builder/chat` — One turn of interview
  - **Request:** `{provider_config_id, model_id, messages}`
  - **Response:** `{assistant_message, ready_to_build, missing_information, captured_summary}`
- `POST /api/managed/team-builder/build` — Generate final team from conversation
  - **Response:** `{team: TeamDetailResponse}`

### Conversations
- `POST /api/managed/teams/{id}/conversations` — Launch conversation
  - **Request:** `{title, participant_slugs, scenario_prompt, max_turns, all_hold_termination, consecutive_speaker_penalty, penalty_multiplier_1/2/3}`
  - **Response:** `{conversationId}`
- `GET /api/managed/conversations/{id}` — Get conversation state
  - **Response:** `{conversation, messages, turns, config}`
- `POST /api/managed/conversations/{id}/turn` — Advance one turn

### Uploads
- `POST /api/managed/uploads/agent-avatar` — Upload image
  - **Response:** `{avatar_url}`

**Classic Mode endpoints (for backward-compat):**
- `GET /api/config` — Bootstrap agent metadata
- `POST /api/reset` — Start new simulation
- `POST /api/turn` — Advance one turn

---

## Root-Level Files

### `main.py`

CLI entry point. Flow:
1. Load `.env`
2. Create timestamped `runs/<ts>/` directory
3. Initialize flow logger
4. Create `Orchestrator` from agents in `agents/`
5. Call `await orchestrator.run()` (loop until termination)
6. Files auto-written to `runs/<ts>/`

### `server.py`

FastAPI server. Listens on `127.0.0.1:8000` (auto-reload in dev).

Holds `global_orchestrator` between requests (single-session model for classic API).

Managed Mode endpoints use SQLite (`arena.db`) for team/provider/conversation persistence.

### `.env`

Single line:
```
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
```

Protected by `.claude/settings.json` against accidental reads.

### `requirements.txt`

- `fastapi`, `uvicorn` — server
- `pydantic` — request validation
- `requests` — HTTP (legacy, mostly unused)
- `python-dotenv` — `.env` loading

---

## How to Add a New Agent

1. Create `agents/<name>/` (lowercase, no spaces)
2. Create `agents/<name>/identity.md` (required):
   - Name, Age, Core Personality
   - Talkativeness (0.0–1.0)
   - Speech Style, Private Goal, Values, Handling Defeat, Urgency Tendency
3. Optionally create `agents/<name>/memory.md` (private facts)
4. Optionally create `agents/<name>/personas.md` (subjective views)
5. Run `python main.py` — agent auto-discovered via folder name

**Sanity check:** Flow log shows agent making decision on turn 1.

---

## How to Add a New Scenario

**Same agents, new context:**
- Edit `shared/kickoff.md` (scene setup)
- Optionally edit `shared/group_memories.md` (shared history)
- Lightly update agents' `identity.md` (private goals reflect scenario)
- Protocol stays same

**New agents, new context:**
- Move/delete `agents/*`
- Create new agents per "How to Add a New Agent"
- Replace `shared/kickoff.md` and `shared/group_memories.md`
- Update `config.MAX_TURNS` if longer/shorter
- Protocol unchanged unless protocol rules change

---

## Debugging Checklist

| Symptom | Where to look |
|---------|--------------|
| Agent never speaks | Check `urgency_tendency` in identity.md; check Phase 1 instruction |
| Same agent dominates | Check `consecutive_wins` in flow log; verify penalty multipliers |
| Inner thoughts look like pitches | Phase 1 instruction in `context_builder.py` needs sharper examples |
| Files not written | `logger.write_files()` called after every turn (already wired) |
| API error | Check `.env` keys valid; check provider is configured in `config.py` |
| Managed Mode broken | Check `arena.db` exists; verify SQLite schema via `db.init_db()` |

---

## Design Principles

1. **LLMs never see urgency.** Floor selection is mechanical Python only.
2. **Inner thought is private.** Transcript contains only spoken messages.
3. **Scenario-agnostic code.** No hardcoded agent names in `src/`.
4. **N-agent generic.** Code works for any count ≥ 2.
5. **Idempotent writes.** `write_files()` safe to call every turn.
6. **Optional files stay optional.** `memory.md` and `personas.md` can be absent.
7. **Provider-agnostic.** Supports OpenAI, Gemini, Anthropic; new providers via `base.py` interface.
8. **Managed Mode is persistent.** SQLite holds teams, providers, conversations; agents/memories computed per turn.
