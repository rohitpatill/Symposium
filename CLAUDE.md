# Agent Teams — Multi-Agent Conversational Orchestration

Framework for simulating realistic group conversations between **N AI agents** with competing
goals, asymmetric information, private inner thoughts, and a mechanical floor protocol.

This file is a quick reference. For deep detail:
- **Backend:** `CONTEXT.md`
- **Frontend:** `agent-chat-arena-main/FRONTEND_CONTEXT.md`

---

## What This Does

Agents take turns in a single shared conversation. Each turn:

1. **Phase 1 (parallel):** every agent emits `{decision, inner_thought, [urgency]}`.
   - `inner_thought` is **private introspection** — never shared.
   - `urgency` is a precise float (e.g. 7.43, never 7.5).
2. **Floor selection (mechanical, no LLM):** highest *effective* urgency wins.
   - **Consecutive-speaker penalty** scales raw urgency down for repeat winners.
   - Exact-tie randomization only.
3. **Phase 2 (winner only):** winner generates the actual outward message from their inner thought.

Termination: `MAX_TURNS` reached, or `ALL_HOLD_TERMINATION` consecutive all-HOLD turns.

---

## Architecture at a Glance

```
agents/<name>/{identity,memory?,personas?}.md   ← per-agent data (memory & personas optional)
shared/{kickoff,protocol,group_memories?}.md    ← scene + rules + filtered group history

src/agent.py            Agent class — system prompt, message array, API calls
src/orchestrator.py     Turn loop, floor selection, penalty, state
src/context_builder.py  Phase 1 prompt + transcript formatting
src/logger.py           Per-run output files (idempotent, written every turn)
src/flow_logger.py      Real-time structured trace

main.py                 CLI entry → runs full conversation
server.py               FastAPI on :8000 → /api/{config,reset,turn}
config.py               All knobs (model, turn limits, penalty multipliers, paths)
```

The code in `src/` is **scenario-agnostic and N-agent generic** — no hardcoded names, no fixed
agent count. `config.AGENTS` is auto-populated from `agents/` subfolders.

---

## Key Mechanisms

### Inner Thought vs Spoken Message
Phase 1 returns a private inner thought (introspection: "I think…", "I'm worried…").
Phase 2 generates the public message. They can differ — inner thought informs but doesn't
literally become the spoken text. The protocol prompt has explicit good/bad examples.

### Consecutive-Speaker Penalty
Models social pressure. Raw urgency × multiplier indexed by prior consecutive wins:
`{0: 1.0, 1: 0.85, 2: 0.65, 3: 0.40}`. The agent's self-reported urgency is never modified —
the penalty is applied externally during floor selection only. **LLMs never see urgency.**
Toggle with `CONSECUTIVE_SPEAKER_PENALTY` flag.

### Thought History (Option A)
Each agent privately sees its own last `MAX_THOUGHT_HISTORY` (default 2) inner thoughts —
both turns it spoke and turns it held. Other agents' thoughts are never visible. This gives
each agent continuity of self.

### Asymmetric Personas
Each agent has its own subjective view of every other agent (in `personas.md`). Aarav's view
of Priya ≠ Priya's view of Aarav.

### Filtered Group Memories
`shared/group_memories.md` is loaded per agent: top-level content + any heading containing the
agent's name + any "all/everyone/shared/group" heading. Pair memories the agent isn't in are
excluded.

---

## Running

### CLI (one-shot full conversation)
```bash
python main.py
```
Outputs land in `runs/<timestamp>/` after every turn (live, not just at end).

### Server (UI mode)
```bash
python server.py            # FastAPI on :8000
# in another terminal:
cd agent-chat-arena-main && npm run dev   # Vite on :8080, proxies /api → :8000
```

---

## Config Cheatsheet (`config.py`)

| Key | Default | Purpose |
|-----|---------|---------|
| `MODEL` | `gpt-4o-mini` | OpenAI model |
| `API_URL` | `…/v1/responses` | Endpoint (NOT chat completions) |
| `AGENTS` | auto-discovered | From `agents/` subfolders |
| `MAX_TURNS` | 20 | Hard cap |
| `ALL_HOLD_TERMINATION` | 2 | Stop after N consecutive all-HOLD turns |
| `MAX_THOUGHT_HISTORY` | 2 | Per-agent private memory window |
| `CONSECUTIVE_SPEAKER_PENALTY` | True | Penalty master flag |
| `CONSECUTIVE_PENALTY_MULTIPLIERS` | `{0:1.0,1:.85,2:.65,3:.40}` | Penalty curve |
| `DECISION_MAX_TOKENS` | 200 | Phase 1 budget |
| `RESPONSE_MAX_TOKENS` | 500 | Phase 2 budget |

`.env`: `OPENAI_API_KEY=Bearer sk-proj-…` (the literal `Bearer ` prefix is required).

---

## Outputs

### `runs/<timestamp>/`
- `<agent>.log` — full per-agent API request/response trace
- `transcript.md` — human-readable conversation
- `decisions.jsonl` — Phase 1 decisions per turn (includes raw + effective urgency, penalty fields)
- `raw.jsonl` — every API call, replayable

### `logs/flow_<timestamp>.log`
Real-time structured trace. Useful for cross-run debugging.

---

## Adding Things

| To add… | Edit |
|---------|------|
| A new agent | Create `agents/<name>/identity.md` (+ optional `memory.md`, `personas.md`). Auto-picked up. |
| A new scenario | Replace `shared/kickoff.md`, optionally `shared/group_memories.md`. Update agents' private goals. |
| A new config knob | `config.py` |
| A new output format | `src/logger.py` `write_files()` |
| A new flow log line | `src/flow_logger.py` |

For step-by-step guides see `CONTEXT.md`.

---

## Design Invariants (don't break)

1. **LLMs never see urgency** — selection is mechanical Python.
2. **Inner thought stays private** — only spoken messages enter the shared transcript.
3. **No hardcoded agent names in `src/`** — themes/triggers/keywords live in data files only.
4. **Idempotent log writes** — `write_files()` is called every turn; safe to re-call.
5. **Optional files stay optional** — `memory.md` and `personas.md` may be absent.
6. **N-agent generic** — code must work for any N ≥ 2.

---

## Debugging Quick Path

1. `logs/flow_<ts>.log` — verify all agents decided, see who won, see penalty in action
2. `runs/<ts>/decisions.jsonl` — inspect raw vs effective urgency, penalty reason
3. `runs/<ts>/<agent>.log` — see exactly what context that agent received and returned
4. `runs/<ts>/transcript.md` — read it like a human

For frontend issues, see `agent-chat-arena-main/FRONTEND_CONTEXT.md` debugging table.
