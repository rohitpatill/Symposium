# Agent Teams — Multi-Agent Conversational Orchestration

Framework for simulating realistic group conversations between **N AI agents** with competing goals, asymmetric information, private inner thoughts, and a mechanical floor protocol.

**Two modes:**
- **Classic:** CLI simulation (`python main.py`) → outputs to `runs/<timestamp>/`
- **Managed:** React UI + SQLite teams, providers, conversations (`python server.py` + `npm run dev`)

For deep detail: see `CONTEXT.md` (backend) and `agent-chat-arena-main/FRONTEND_CONTEXT.md` (frontend).

---

## What This Does

Agents take turns in a single shared conversation. Each turn:

1. **Phase 1 (parallel):** All agents emit `{decision, inner_thought, [urgency]}`
   - `inner_thought` — private introspection, never shared with other agents
   - `urgency` — precise float (e.g., 7.43); only used for floor selection
2. **Floor selection (mechanical, no LLM):** Highest effective urgency wins
   - **Consecutive-speaker penalty:** Raw urgency × multiplier for repeat winners (`{0:1.0, 1:0.85, 2:0.65, 3:0.40}`)
   - Exact-tie breaks randomly
3. **Phase 2 (winner only):** Winner generates outward message from their inner thought

**Termination:** `MAX_TURNS` reached (default 20) OR `ALL_HOLD_TERMINATION` consecutive all-HOLD turns (default 2).

---

## Quick Start

### CLI (Classic Mode)
```bash
python main.py
# Outputs in runs/<timestamp>/: transcript.md, decisions.jsonl, <agent>.log, raw.jsonl
```

### Server (Managed Mode)
```bash
python server.py                    # FastAPI on :8000
cd agent-chat-arena-main && npm run dev  # Vite on :8080 (proxies /api → :8000)
```

Open `http://localhost:8080` → Create teams, manage providers, launch conversations, view results.

---

## Architecture

```
Backend (src/ and root):
├── agent.py              Agent class (personality, memories, API calls)
├── orchestrator.py       Turn loop, floor protocol, penalty system
├── context_builder.py    Phase 1 decision prompts
├── logger.py             Output files (idempotent per-turn writes)
├── flow_logger.py        Real-time structured trace
├── providers/            Multi-provider LLM abstraction (OpenAI, Gemini, Anthropic)
├── main.py               CLI entry point
├── server.py             FastAPI server (Managed Mode + classic API)
├── db.py                 SQLite schema (teams, providers, conversations)
└── config.py             All tunable constants

Data (agents/ and shared/):
├── agents/<name>/
│   ├── identity.md       (required) Personality + goals
│   ├── memory.md         (optional) Private facts
│   └── personas.md       (optional) Subjective views of others
└── shared/
    ├── kickoff.md        Scene setup (turn 0)
    ├── protocol.md       Floor rules + thought guidance
    └── group_memories.md (optional) Shared/pair history

Frontend (agent-chat-arena-main/):
├── src/pages/
│   ├── Index.tsx         Classic mode viewer (demo)
│   ├── Teams.tsx         Managed mode home (team CRUD + builder)
│   └── ManagedConversation.tsx  Conversation viewer
├── src/components/       UI components (messages, avatars, panels, forms)
├── src/hooks/           useSimulation, useManagedConversation
└── src/lib/             types.ts, utils, mocks
```

All backend code is **scenario-agnostic and N-agent generic** — no hardcoded names or agent counts.

---

## Key Concepts

### Inner Thought vs Spoken Message
Phase 1: agent introspects privately ("I'm worried…", "I should push back…")
Phase 2: agent crafts public pitch from that thought — they differ intentionally.
Only spoken messages enter the shared transcript.

### Consecutive-Speaker Penalty
Prevents one agent from dominating. Raw `urgency × multiplier` where multiplier decreases with consecutive wins. The agent's urgency value is never modified; penalty is applied during **mechanical floor selection only** in Python. **LLMs never see urgency values.**

### Asymmetric Information
- **Personas:** Each agent's subjective view of every other agent differs (`personas.md`)
- **Filtered memories:** `shared/group_memories.md` per agent — only includes agent's own name, "all/shared/group" headings, and pair memories the agent is in
- **Thought history:** Each agent sees only their own last N inner thoughts (default 2)

### Multi-Provider LLM Support
Backend abstraction supports OpenAI (`/v1/responses`), Google Gemini, Anthropic APIs. Frontend lets users select provider per agent team. See `src/providers/` for implementations.

### Managed Mode Persistence
SQLite (`arena.db`) stores:
- **Teams:** Reusable agent team templates
- **Providers:** API key configs (encrypted with Windows DPAPI)
- **Conversations:** Launched discussions from teams with full message/decision history

---

## Configuration (`config.py`)

**Orchestration:**
- `MAX_TURNS` (20) — hard stop
- `ALL_HOLD_TERMINATION` (2) — consecutive all-HOLD termination
- `MAX_THOUGHT_HISTORY` (2) — per-agent private thought window
- `CONSECUTIVE_SPEAKER_PENALTY` (True) — enable penalty system
- `CONSECUTIVE_PENALTY_MULTIPLIERS` ({0:1.0, 1:0.85, 2:0.65, 3:0.40}) — penalty curve

**Budgets:**
- `DECISION_MAX_TOKENS` (200) — Phase 1 per agent
- `RESPONSE_MAX_TOKENS` (500) — Phase 2 winner only

**Providers:**
- `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` — from `.env`
- `DEFAULT_PROVIDER` — auto-detected from keys in `.env`
- `DEFAULT_MODEL` — model per provider

For full config documentation, see `CONTEXT.md` → Configuration.

---

## Outputs (Classic Mode)

`runs/<timestamp>/:`
- `transcript.md` — human-readable conversation
- `decisions.jsonl` — Phase 1 decisions per turn (urgency, penalty, thoughts)
- `<agent>.log` — full per-agent API trace
- `raw.jsonl` — every API call (replayable)

`logs/flow_<timestamp>.log` — real-time structured trace (useful for debugging floor selection).

---

## Adding to the System

| To add… | Where |
|---------|-------|
| New agent | Create `agents/<name>/identity.md` + optional `memory.md`, `personas.md`. Auto-discovered. |
| New scenario | Edit `shared/kickoff.md`, `shared/group_memories.md`, agents' goals. |
| New config knob | `config.py` |
| New decision field | Backend: return in `orchestrator.run_turn()` → Frontend: add to `lib/types.ts` Decision type, render in `UnderTheHoodPanel.tsx` |
| New team form field | Frontend `Teams.tsx`: add state + input + POST body + hydrate logic |
| New provider | Backend: create `src/providers/<name>_provider.py` extending `ProviderBase`, register in `registry.py` |

For step-by-step guides: see `CONTEXT.md` (backend) or `agent-chat-arena-main/FRONTEND_CONTEXT.md` (frontend).

---

## Design Invariants

1. **LLMs never see urgency** — floor selection is pure Python
2. **Inner thought stays private** — only spoken messages in shared transcript
3. **No hardcoded agent names in code** — personality/goals live in data files only
4. **Idempotent writes** — `logger.write_files()` safe to call every turn
5. **Optional files stay optional** — `memory.md` and `personas.md` may be absent
6. **N-agent generic** — code works for any agent count ≥ 2
7. **Provider-agnostic** — supports multiple LLM backends
8. **Managed Mode is persistent** — SQLite holds state across sessions

---

## Debugging Checklist

**Backend Issues:**
- Flow not working → check `logs/flow_<ts>.log` for phase 1/2 steps
- Agent never speaks → check `urgency_tendency` in `identity.md`, verify Phase 1 instruction in `context_builder.py`
- Same agent dominates → check `CONSECUTIVE_SPEAKER_PENALTY` enabled, verify penalty multipliers
- Files not written → `logger.write_files()` called every turn (already wired)
- API errors → check `.env` keys valid, provider configured in `config.py`

**Frontend Issues:**
- Classic mode → see `agent-chat-arena-main/FRONTEND_CONTEXT.md` debugging table
- Managed mode teams → check `/api/managed/teams` returns; verify DB `arena.db` exists
- AI builder blank → check `/api/managed/team-builder/chat` response fields match `lib/types.ts`
- Conversation won't load → check `/api/managed/conversations/{id}` endpoint, verify `teamId` in URL

---

## Further Reading

- **Backend deep dive:** `CONTEXT.md` — orchestrator, providers, database, endpoints
- **Frontend architecture:** `agent-chat-arena-main/FRONTEND_CONTEXT.md` — components, hooks, state flow
- **Quick reference on this page** — overview, quick start, invariants
