# Frontend Context — UI Architecture & Backend Integration

This document is the **single source of truth** for the React + Vite frontend that visualizes
the multi-agent conversation backend. Pair it with the root `CONTEXT.md` (backend guide).

Use this when:
- Adding new UI elements
- Changing how decisions/penalties/thoughts are displayed
- Wiring new backend endpoints into the UI
- Onboarding any agent (human or AI) onto the frontend

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Backend ↔ Frontend Wiring](#backend--frontend-wiring)
3. [API Contract](#api-contract)
4. [Folder Layout](#folder-layout)
5. [Top-Level Files](#top-level-files)
6. [Source Layout (`src/`)](#source-layout-src)
7. [Pages](#pages)
8. [Components](#components)
9. [Hooks](#hooks)
10. [Lib (Types, Utils, Mocks)](#lib-types-utils-mocks)
11. [State Flow](#state-flow)
12. [How to Add a New UI Element](#how-to-add-a-new-ui-element)
13. [Modification Reference Map](#modification-reference-map)

---

## Tech Stack

- **Framework:** React 18 + TypeScript
- **Build tool:** Vite 5 with `@vitejs/plugin-react-swc`
- **Routing:** React Router DOM (single route `/` → `Index` page)
- **Styling:** Tailwind CSS + custom CSS variables (`index.css`)
- **UI primitives:** shadcn/ui components in `src/components/ui/` (Radix-based)
- **Icons:** lucide-react
- **Data fetching:** raw `fetch()` calls (no axios). React Query is set up but not currently used.
- **Package manager:** npm or bun (both lockfiles present)

Run dev server: `npm run dev` (or `bun run dev`) → listens on **port 8080**.

---

## Backend ↔ Frontend Wiring

The frontend is a **standalone Vite app** that talks to the FastAPI backend over HTTP.

### Local dev

- Frontend: `http://localhost:8080` (Vite)
- Backend: `http://localhost:8000` (FastAPI / `python server.py`)
- **Vite proxy** (`vite.config.ts`) forwards `/api/*` from the Vite server to the backend:

```ts
server: {
  port: 8080,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true
    }
  }
}
```

So the frontend code calls `fetch("/api/turn")` (relative path) and the proxy rewrites that to
`http://127.0.0.1:8000/api/turn`. **Always use relative `/api/...` URLs in code** — never
hardcode `localhost:8000`.

### Production

In production both apps need to be served together (e.g. FastAPI mounting the built Vite assets,
or a reverse proxy in front of both). CORS is currently open (`*`) on the backend — tighten this.

---

## API Contract

Three endpoints power the entire UI. All are JSON. All live in `server.py` on the backend.

### `GET /api/config`

Called once on app load to bootstrap the agent metadata + kickoff text.

**Response shape:**
```json
{
  "status": "ok",
  "agents": {
    "<agent_id>": {
      "id": "nova",
      "name": "Nova",
      "role": "Hysterical, entitled, brilliant scientist",
      "initials": "NO",
      "emoji": "👤",
      "themeColor": "#E76F51",
      "bgColor": "rgba(231, 111, 81, 0.1)",
      "ringColor": "rgba(231, 111, 81, 0.4)"
    }
    // ... one entry per agent folder in agents/
  },
  "kickoff": "<scene-setup text from shared/kickoff.md>"
}
```

The backend parses each agent's `identity.md` to extract `Name` and `Core Personality` (used as
`role`). It assigns colors from a palette of 6, cycling if there are more agents.

### `POST /api/reset`

Creates a new `runs/<timestamp>/` directory, instantiates an `Orchestrator`, and calls
`bootstrap()` (which seeds the kickoff into all agents' message arrays + the shared transcript).

**Response:** `{ "status": "ok", "message": "Simulation reset and bootstrapped." }`

The backend keeps a single `global_orchestrator` between requests. Calling `/api/reset` again
discards the previous one.

### `POST /api/turn`

Advances the conversation by exactly one turn. Calls `orchestrator.run_turn()`.

**Response shape:**
```json
{
  "status": "ok",
  "continue": true,
  "data": {
    "turn": 5,
    "winner": "nova",
    "message": "Listen, my data is critical for humanity...",
    "decisions": {
      "<agent_id>": {
        "name": "nova",
        "decision": "SPEAK",
        "urgency": 9.85,
        "effective_urgency": 8.37,
        "penalty_multiplier": 0.85,
        "penalty_delta": -1.48,
        "consecutive_wins_before": 1,
        "penalty_reason": "won previous turn",
        "inner_thought": "I have to push my research now or it gets lost.",
        "reason": "I have to push my research now or it gets lost.",
        "raw_output": "...",
        "usage": { ... }
      }
      // one entry per agent
    },
    "timestamp": 1761234567890
  }
}
```

Key fields:
- `continue: false` → conversation finished (max turns or all-HOLD termination)
- `winner` is `null` on all-HOLD turns; `message` is `""`
- `decisions[id].inner_thought` — current canonical field for the private thought
- `decisions[id].reason` — backward-compat mirror of `inner_thought`
- `effective_urgency`, `penalty_multiplier`, `penalty_delta`, `penalty_reason`,
  `consecutive_wins_before` — penalty system fields, see backend `CONTEXT.md`

---

## Folder Layout

```
agent-chat-arena-main/
├── index.html
├── package.json
├── vite.config.ts                # Dev proxy /api → :8000
├── tsconfig.{json,app.json,node.json}
├── tailwind.config.ts
├── postcss.config.js
├── eslint.config.js
├── components.json               # shadcn/ui config
├── public/                       # Static assets
├── FRONTEND_CONTEXT.md           # ← this file
└── src/
    ├── main.tsx                  # ReactDOM root
    ├── App.tsx                   # Router + global providers
    ├── index.css                 # Tailwind + design tokens
    ├── App.css
    ├── vite-env.d.ts
    ├── pages/
    │   ├── Index.tsx             # Main simulation page (only real route)
    │   └── NotFound.tsx          # 404
    ├── components/
    │   ├── ChatHeader.tsx        # Top bar: status, controls, agents list
    │   ├── ChatStream.tsx        # Scrolling message list (left/main panel)
    │   ├── MessageBubble.tsx     # Individual message rendering
    │   ├── TypingIndicator.tsx   # "thinking…" indicator
    │   ├── AgentAvatar.tsx       # Avatar circle with initials + color
    │   ├── UnderTheHoodPanel.tsx # Right panel: per-agent decisions, urgency, thoughts, penalty
    │   ├── NavLink.tsx
    │   └── ui/                   # shadcn primitives (button, switch, tooltip, etc.)
    ├── hooks/
    │   ├── useSimulation.ts      # The main state container — owns ALL simulation state
    │   ├── use-mobile.tsx
    │   └── use-toast.ts
    ├── lib/
    │   ├── types.ts              # All TypeScript types (Decision, Turn, AgentMeta, etc.)
    │   ├── agents.ts              # Legacy stub (just exports `AgentId = string`)
    │   ├── mockTurns.ts          # Mock data, no longer imported by main flow
    │   └── utils.ts              # cn() helper
    └── test/
```

---

## Top-Level Files

### `index.html`
Standard Vite root. `<div id="root">` → `main.tsx` mounts here.

### `package.json`
Scripts:
- `dev` → `vite` (port 8080)
- `build` → `vite build`
- `preview` → `vite preview`
- `lint` → `eslint .`

### `vite.config.ts`
- Vite + React SWC plugin
- `lovable-tagger` (dev-only)
- `@` alias → `./src`
- `/api` proxy → `http://127.0.0.1:8000`
- Port 8080, HMR overlay disabled

### `components.json`
shadcn/ui config — controls how new components are added via the shadcn CLI. Don't edit by hand.

### `tailwind.config.ts`, `postcss.config.js`
Tailwind setup. Custom colors and shadows defined as CSS variables in `index.css`.

---

## Source Layout (`src/`)

### `main.tsx`
Mounts `<App />` into `#root` with React 18's `createRoot`. Three lines.

### `App.tsx`
Wraps everything with:
- `QueryClientProvider` (React Query — currently unused but available)
- `TooltipProvider` (Radix tooltip context)
- `Toaster` and `Sonner` (two toast UIs available)
- `BrowserRouter` with two routes:
  - `/` → `Index`
  - `*` → `NotFound`

### `index.css`
Tailwind imports + design tokens (CSS variables for color theme, glass effects, animations like
`animate-fade-in`, `animate-message-in`, `animate-urgency-fill`).

---

## Pages

### `pages/Index.tsx`
The only real page. Composition:

```
<Index>
  ├── useSimulation() hook (gives you everything)
  ├── <ChatHeader />            (top bar)
  └── flex row:
      ├── <ChatStream />        (main content, messages)
      └── <UnderTheHoodPanel /> (right panel, ≥ lg breakpoint, toggleable)
```

Local state: `panelOpen` (boolean) — controls whether the right panel renders.

### `pages/NotFound.tsx`
Plain 404.

---

## Components

### `components/ChatHeader.tsx`
Top bar. Shows:
- Logo + "Simulation" + dot-separated agent name list
- "Turn N/Total" pill
- Action buttons: **Start conversation** (before start) → **Auto-play switch + Next turn + Reset** (after)
- Right-edge toggle for the Under The Hood panel

Receives all state via props from `Index` → ultimately from `useSimulation`.

### `components/ChatStream.tsx`
Scrollable message list. Three states:
- **Not started:** Big "Watch the agents negotiate" hero with the agent names
- **Running:** Maps `messages[]` → `<MessageBubble>` per item; shows `<TypingIndicator>` while `isThinking`
- Auto-scrolls to bottom on every message append (via `endRef.scrollIntoView`)

### `components/MessageBubble.tsx`
Renders one chat message:
- **Narrator messages** (speaker === "narrator") → centered glass pill with "Scene" label
- **Agent messages** → avatar on left, name/role/turn header, colored bubble, timestamp
- Bubble color comes from `meta.bgColor` and `meta.ringColor` (assigned by backend)

### `components/TypingIndicator.tsx`
Three pulsing dots while `status === "thinking"`. Small footprint.

### `components/AgentAvatar.tsx`
Small circular avatar — initials over a tinted background using `meta.bgColor`. Multiple sizes.

### `components/UnderTheHoodPanel.tsx`
**The most important visualization component.** Right-side dev panel.

Three states:
- **Not started:** Empty placeholder with "Start the conversation to inspect..."
- **Thinking (mid-turn):** All agents shown as "deciding…" placeholders
- **Turn complete:** Renders one `<DecisionRow>` per agent + a `<HeldThoughts>` block

#### `<DecisionRow>` (private subcomponent)
For each agent, shows:
- Avatar + name + 🏆 Floor badge if winner
- SPEAK / HOLD pill
- **Urgency bar** — width = `effective_urgency / 10 * 100%`
- **Urgency number(s)** — if penalty applied:
  - Raw urgency in struck-through faded text: `9.25`
  - Effective urgency in primary color: `7.86`
- **Penalty annotation** (only if `penalty_multiplier !== 1.0`):
  - ⚡ icon + delta + reason: `−1.39 · won previous turn`
- **Inner thought** in italic quotes (reads `inner_thought`, falls back to `reason`)

#### `<HeldThoughts>` (private subcomponent)
Lists agents who chose SPEAK but lost the floor. Shows their inner thought as a "what they
wanted to say" callout. Only renders if there are losers.

### `components/NavLink.tsx`
Small link wrapper, currently unused in main flow.

### `components/ui/`
shadcn/ui primitives — auto-generated wrappers around Radix UI. Don't hand-edit these; if you
need new ones, add via shadcn CLI. Notable ones used: `button`, `switch`, `tooltip`, `toaster`,
`sonner`.

---

## Hooks

### `hooks/useSimulation.ts`
**The brain of the frontend.** Owns all simulation state, calls backend, exposes everything to
`Index.tsx`.

State held:
| State | Type | Meaning |
|-------|------|---------|
| `messages` | `ChatMessage[]` | Visible chat bubbles (kickoff narrator + each turn's winner) |
| `turns` | `Turn[]` | Full per-turn data including all decisions (drives Under The Hood panel) |
| `currentTurnIndex` | `number` | Which turn is currently shown in the panel |
| `status` | `"idle" \| "running" \| "thinking" \| "paused" \| "finished"` | UI state machine |
| `autoPlay` | `boolean` | Auto-advance every 1500ms |
| `config` | `SimulationConfig \| null` | Agent metadata + kickoff (from `/api/config`) |
| `loadingConfig` | `boolean` | True until first `/api/config` resolves |
| `isRequestingRef` | `useRef<boolean>` | Guard against double-submitting `/api/turn` |

Actions exposed:
- `start()` — calls `/api/reset`, seeds the narrator message into `messages`, sets status to "running"
- `advance()` — calls `/api/turn`, appends to `turns` and `messages`, handles `continue: false` → "finished"
- `reset()` — clears all local state (does NOT call backend; new run starts on next `start()`)
- `setAutoPlay(boolean)` — toggle auto-advance loop

Auto-play loop uses `useEffect` + `setTimeout(1500ms)` to call `advance()` while
`autoPlay && status === "running"`.

`config.agents["narrator"]` is injected client-side as a constant `NARRATOR_META` (the backend
doesn't return narrator).

### `hooks/use-mobile.tsx`
Returns `true` if viewport < 768px. Used for responsive logic.

### `hooks/use-toast.ts`
shadcn's toast hook (used by `Toaster` component). No simulation logic.

---

## Lib (Types, Utils, Mocks)

### `lib/types.ts`
All TypeScript types. Single source for shapes.

```ts
AgentMeta { id, name, role, initials, emoji, themeColor, bgColor, ringColor }
Decision  { decision: "SPEAK"|"HOLD", urgency?, effective_urgency?,
            penalty_multiplier?, penalty_reason?, consecutive_wins_before?,
            reason?, inner_thought? }
Turn      { turn, winner, message, decisions: Record<id, Decision>, timestamp }
ChatMessage { id, turn?, speaker, text, timestamp }
SimulationConfig { agents: Record<id, AgentMeta>, kickoff: string }
```

When backend adds new fields, **update `Decision` here first**, then propagate to consumers.

### `lib/agents.ts`
Currently a stub: `export type AgentId = string;`. Historically held hardcoded agent IDs;
now we use dynamic IDs from `/api/config`. Don't reintroduce hardcoding.

### `lib/utils.ts`
Single `cn(...classes)` helper from shadcn — merges Tailwind classes with `tailwind-merge`.

### `lib/mockTurns.ts`
Legacy mock data for offline UI work. Not imported by the live flow. Kept for reference.

---

## State Flow

End-to-end for one turn:

1. **App load** → `useSimulation` mounts → `useEffect` fires `GET /api/config` → fills `config`.
2. **User clicks "Start"** → `start()` calls `POST /api/reset` → on success, appends a narrator
   `ChatMessage` (`config.kickoff`) to `messages` and flips `status` to `"running"`.
3. **User clicks "Next turn"** (or auto-play tick) → `advance()`:
   - Sets `status` to `"thinking"` (UI shows typing indicator + grayed-out decision rows)
   - Calls `POST /api/turn`
   - On response:
     - Appends `result.data` to `turns[]`
     - If `winner && message`: appends a new `ChatMessage` to `messages[]`
     - `currentTurnIndex` increments → `<UnderTheHoodPanel>` re-renders with that turn's decisions
     - If `result.continue === false` → `status` to `"finished"`, `autoPlay` off
   - Otherwise `status` returns to `"running"`
4. **Reset** → `reset()` clears all state. Next `start()` will hit `/api/reset` again.

---

## How to Add a New UI Element

### Adding a new field from a turn's decisions
1. Backend already returns it in `decisions[id]` (verify in `server.py` / `orchestrator.py`).
2. Add field to `Decision` type in `lib/types.ts`.
3. Read it in `UnderTheHoodPanel.tsx`'s `<DecisionRow>`. Render conditionally.

### Adding a new control button in the header
1. Add prop to `ChatHeader` Props interface.
2. Pass from `Index.tsx`, sourced from `useSimulation` (you may need to add an action there).
3. If the action requires a backend call, add the fetch in `useSimulation` and a corresponding
   FastAPI endpoint in `server.py`.

### Adding a new sidebar tab/panel
1. Build a new component (mirror `UnderTheHoodPanel.tsx`'s pattern).
2. Mount it in `Index.tsx` next to the existing panel, or replace based on a tab state.

### Adding a new route/page
1. Create `pages/<PageName>.tsx`.
2. Register in `App.tsx`'s `<Routes>` block.
3. Link to it from `ChatHeader.tsx` or wherever appropriate.

---

## Modification Reference Map

| If you want to… | Edit |
|-----------------|------|
| Show a new decision field (penalty, etc.) | `lib/types.ts` (type) → `components/UnderTheHoodPanel.tsx` (render) |
| Change message bubble appearance | `components/MessageBubble.tsx` |
| Change typing animation | `components/TypingIndicator.tsx` + `index.css` (animations) |
| Change agent avatar style | `components/AgentAvatar.tsx` |
| Change auto-play interval | `hooks/useSimulation.ts` (`setTimeout` value, currently 1500ms) |
| Change total turns display | `hooks/useSimulation.ts` (`totalTurns: 20` — keep in sync with backend `MAX_TURNS`) |
| Add a new API endpoint call | `hooks/useSimulation.ts` (action) + new method in `server.py` |
| Change theme/colors | `index.css` (CSS variables) + `tailwind.config.ts` |
| Change how agent role is extracted | Backend `server.py` `/api/config` (regex on `identity.md`) |
| Change agent color palette | `server.py` `AGENT_COLORS` array |
| Add a new page | `pages/<Name>.tsx` + register in `App.tsx` |
| Tighten CORS | Backend `server.py` `allow_origins` |

---

## Debugging Checklist

| Symptom | Likely cause / where to look |
|---------|-----------------------------|
| Header shows no agent names | `/api/config` failed or returned empty `agents`. Check backend running on :8000 |
| "Start" button greyed out | `config` is null. `loadingConfig` still true. `/api/config` not resolving |
| Agents listed but no avatars | `meta.bgColor` / `themeColor` missing — check `AGENT_COLORS` palette wraparound |
| Click "Next turn" → 500 | `/api/reset` was never called or backend orchestrator is None — check FastAPI logs |
| Penalty annotation never shows | All wins are non-consecutive in the run, OR `effective_urgency === urgency`. Inspect `decisions.jsonl` |
| Inner thought is empty | Backend extracted `reason` but model returned different key. Check `agent.py` parsing |
| Auto-play won't stop | `status` got stuck on "thinking". Reset to recover |

---

## Design Principles (don't violate without thought)

1. **No hardcoded agent IDs.** Agent metadata comes from `/api/config`, not from a static list.
2. **Use the `/api/...` proxy path.** Never write `http://localhost:8000` in frontend code.
3. **`useSimulation` is the only state owner.** Don't duplicate simulation state in components.
4. **Read both `inner_thought` and `reason`.** Backward-compat — fall back gracefully.
5. **Render effective urgency for visual ranking.** The bar width must match who actually won.
6. **Don't mutate `Turn` objects.** Append new ones; React relies on referential identity.
7. **Keep `lib/types.ts` honest.** Update it the same commit as backend changes — don't drift.
