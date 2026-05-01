# Frontend Context — UI Architecture & Backend Integration

This document is the **single source of truth** for the React + Vite frontend that visualizes
the multi-agent conversation backend and manages the Managed Mode team builder. Pair it with the root `CONTEXT.md` (backend guide).

Use this when:
- Adding new UI elements
- Changing how decisions/penalties/thoughts are displayed
- Wiring new backend endpoints into the UI
- Building team creation, editing, or conversation management flows
- Working with the Managed Mode API (`/api/managed/*`)

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Backend ↔ Frontend Wiring](#backend--frontend-wiring)
3. [API Contracts](#api-contracts)
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

## Simulation API (Classic Mode)

### `GET /api/config`
Called once on app load to bootstrap agent metadata + kickoff text.
**Response:** `{ agents: Record<id, AgentMeta>, kickoff: string }`

### `POST /api/reset`
Creates a new `runs/<timestamp>/`, instantiates an `Orchestrator`, seeds kickoff.
**Response:** `{ status: "ok", message: "Simulation reset and bootstrapped." }`

### `POST /api/turn`
Advances conversation by one turn. 
**Response:** `{ status: "ok", continue: bool, data: Turn }`
- `continue: false` → finished (max turns or all-HOLD termination)
- `data.winner` null on all-HOLD turns; `message` empty
- `decisions[id].inner_thought` is canonical private thought
- `decisions[id]` includes: `urgency`, `effective_urgency`, `penalty_multiplier`, `penalty_reason`, `consecutive_wins_before`

## Managed Mode API (`/api/managed/*`)

The Managed Mode lets users create and manage reusable agent teams, then launch conversations from them.

### Team Management
- `GET /api/managed/teams` — list all teams
- `POST /api/managed/teams` — create new team
- `GET /api/managed/teams/{id}` — get team detail with agents + conversations + scenario
- `PUT /api/managed/teams/{id}` — save team changes
- `DELETE /api/managed/teams/{id}` — delete team

### Agent Management (within teams)
- `DELETE /api/managed/teams/{id}/agents/{slug}` — remove agent from team

### Provider Management
- `GET /api/managed/providers` — list configured provider keys
- `POST /api/managed/providers` — validate and save new provider key
- `DELETE /api/managed/providers/{id}` — delete provider config

### AI Team Builder
- `POST /api/managed/team-builder/chat` — one turn of the builder interview (Symposium AI asking questions)
  - **Request:** `{ provider_config_id, model_id, messages: BuilderChatMessage[] }`
  - **Response:** `{ assistant_message, ready_to_build, missing_information, captured_summary }`
- `POST /api/managed/team-builder/build` — generate final team from interview conversation
  - **Request:** `{ provider_config_id, model_id, messages: BuilderChatMessage[] }`
  - **Response:** `{ team: TeamDetailResponse }`

### Conversation Management
- `POST /api/managed/teams/{id}/conversations` — launch a new conversation from a team
  - **Request:** `{ title, scenario_prompt, participant_slugs, max_turns, all_hold_termination, consecutive_speaker_penalty, penalty_multiplier_1/2/3 }`
  - **Response:** `{ conversationId }`
- `GET /api/managed/conversations/{id}` — get conversation state, messages, decisions
  - **Response:** `{ conversation, messages: ChatMessage[], turns: Turn[], config }`

### Uploads
- `POST /api/managed/uploads/agent-avatar` — upload agent profile image
  - **Response:** `{ avatar_url }`

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
    │   ├── Index.tsx             # Classic simulation viewer (demo mode)
    │   ├── Teams.tsx             # Managed Mode home — team list + create/edit dialogs
    │   ├── ManagedConversation.tsx # Managed Mode conversation viewer + Under The Hood
    │   ├── Home.tsx              # Legacy (may be unused)
    │   └── NotFound.tsx          # 404
    ├── components/
    │   ├── ChatHeader.tsx        # Top bar: status, controls, agents list
    │   ├── ChatStream.tsx        # Scrolling message list (left/main panel)
    │   ├── MessageBubble.tsx     # Individual message rendering
    │   ├── TypingIndicator.tsx   # "thinking…" indicator
    │   ├── AgentAvatar.tsx       # Avatar circle with initials + color
    │   ├── UnderTheHoodPanel.tsx # Right panel: per-agent decisions, urgency, thoughts, penalty
    │   ├── ScenarioSheetButton.tsx # Scenario modal trigger
    │   ├── NavLink.tsx
    │   ├── teams/
    │   │   ├── Field.tsx         # Form field label + hint wrapper
    │   │   ├── TeamsHomeView.tsx # Teams grid + create button
    │   │   ├── TeamDetailView.tsx # Team detail — agents, conversations, edit/delete
    │   │   ├── ProvidersDialog.tsx # Provider key management UI
    │   │   └── ModelPickerDialog.tsx # Model selection for agents
    │   └── ui/                   # shadcn primitives (button, dialog, input, textarea, etc.)
    ├── hooks/
    │   ├── useSimulation.ts      # Classic mode — simulation state + /api/turn
    │   ├── useManagedConversation.ts # Managed mode — conversation state + decisions
    │   ├── use-mobile.tsx
    │   └── use-toast.ts
    ├── lib/
    │   ├── types.ts              # All TypeScript types (Decision, Turn, AgentMeta, TeamDetailResponse, etc.)
    │   ├── agents.ts             # Legacy stub (just exports `AgentId = string`)
    │   ├── mockTurns.ts          # Mock data for local testing
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

### `pages/Teams.tsx`
**Managed Mode home.** Monolithic component managing team CRUD, provider setup, and AI team builder interview.

State includes:
- Teams list + current detail
- Form state for create/edit: name, description, agents, group memories, scenario template
- Provider management: type, API key, validation status
- AI builder: messages, input, ready flag, missing fields
- Dialogs: create team, setup providers, model picker
- Confirm dialog: delete confirmations

Routes handled:
- `/teams` — home view (team list)
- `/teams/:teamId` — detail view (team + conversations + edit)

Exports: Dialog triggers, form handlers, all create/edit/delete logic inline.

### `pages/ManagedConversation.tsx`
**Managed Mode conversation viewer.** Displays a conversation launched from a team.

Uses `useManagedConversation()` hook to load conversation state, messages, turns, decisions.
Displays `<ChatHeader>`, `<ChatStream>`, and `<UnderTheHoodPanel>` (toggleable).
Allows: Start conversation, advance turns, reset.

Routes handled:
- `/teams/:teamId/conversations/:conversationId` — conversation viewer

### `pages/Index.tsx`
**Classic Mode demo.** Shows the original proof-of-concept simulation flow.

Uses `useSimulation()` hook to manage simulation state.
Displays `<ChatHeader>`, `<ChatStream>`, and `<UnderTheHoodPanel>` (toggleable).

Routes handled:
- `/default` — classic simulation

### `pages/NotFound.tsx`
Plain 404.

---

## Components

### Simulation Viewers
**`ChatHeader.tsx`** — Top bar with controls (start, advance, reset, auto-play toggle, panel toggle)
**`ChatStream.tsx`** — Scrollable message list; hero state (not started) → running state (messages + typing indicator)
**`MessageBubble.tsx`** — Individual message: narrator (centered pill) or agent (avatar + bubble)
**`TypingIndicator.tsx`** — Three pulsing dots while thinking
**`AgentAvatar.tsx`** — Avatar circle with initials + theme color
**`UnderTheHoodPanel.tsx`** — Right panel showing per-agent decisions, urgency bars, penalty annotation, inner thoughts
**`ScenarioSheetButton.tsx`** — Modal button to view the scenario prompt

### Managed Mode Team Builder
**`teams/TeamsHomeView.tsx`** — Grid of team cards; displays team list for home view
**`teams/TeamDetailView.tsx`** — Team detail: agent list, conversations, edit/delete buttons
**`teams/ProvidersDialog.tsx`** — Provider key input, validation status, delete provider
**`teams/ModelPickerDialog.tsx`** — Dropdown to select model for an agent
**`teams/Field.tsx`** — Form field wrapper (label + optional hint)

### UI Primitives
**`ui/`** — shadcn/ui components (button, dialog, input, textarea, checkbox, select, etc.). Auto-generated; use shadcn CLI to add new ones.

---

## Hooks

### `hooks/useSimulation.ts`
**Classic mode state.** Owns simulation state, calls `/api/turn`, `/api/reset`, `/api/config`.

State: `messages`, `turns`, `currentTurnIndex`, `status`, `autoPlay`, `config`, `loadingConfig`, `isRequestingRef`
Actions: `start()`, `advance()`, `reset()`, `setAutoPlay()`, `reload()`

Auto-play loop: `useEffect` + `setTimeout(1500ms)` ticks `advance()` while running.
Injects narrator via `NARRATOR_META` (not returned by backend).

### `hooks/useManagedConversation.ts`
**Managed mode state.** Owns conversation state, calls `/api/managed/conversations/{id}`.

State: `conversation`, `messages`, `turns`, `config`, `loading`, `error`, `isThinking`, `hasStarted`, `status`, `totalTurns`, `completedTurns`, `currentTurn`
Actions: `start()`, `advance()`, `reload()`, `reset()`

Similar to `useSimulation` but reads Managed Mode responses with team scoping.

### `hooks/use-mobile.tsx`
Returns `true` if viewport < 768px.

### `hooks/use-toast.ts`
shadcn's toast hook.

---

## Lib (Types, Utils, Mocks)

### `lib/types.ts`
All TypeScript types. Single source of truth.

**Classic:**
- `AgentMeta` — agent identity + colors (from `/api/config`)
- `Decision` — one agent's turn decision (SPEAK/HOLD, urgency, penalty, inner_thought)
- `Turn` — one conversation turn (winner, message, all decisions)
- `ChatMessage` — visible message (speaker, text, timestamp)
- `SimulationConfig` — bootstrap config (agents, kickoff)

**Managed Mode:**
- `TeamSummary` — team metadata (id, name, description, created_at)
- `TeamDetailResponse` — full team (team, agents, conversations, scenarioTemplate, groupMemories)
- `ManagedAgentDraft` — agent being edited (display_name, role, provider_config_id, model_id, personality fields, personas)
- `ManagedGroupMemoryDraft` — shared memory (title, content, participant_slugs, is_general)
- `ProviderConfigSummary` — provider key (id, display_name, provider_type, is_valid)
- `ProviderCatalogEntry` — provider metadata (id, name, models[])

When backend changes, update types here first, then consume in hooks/components.

### `lib/agents.ts`
Stub: `export type AgentId = string;`. Don't hardcode agent IDs; use `/api/config` or API responses.

### `lib/utils.ts`
`cn(...classes)` — merges Tailwind classes with `tailwind-merge`.

### `lib/mockTurns.ts`
Legacy mock data. Not used by live flow. Reference only.

---

## State Flow

### Classic Mode (Index.tsx + useSimulation)
1. **App load** → `useSimulation` mounts → fetches `/api/config`
2. **User clicks "Start"** → `start()` calls `/api/reset`, appends narrator message
3. **User clicks "Next turn"** → `advance()` calls `/api/turn`, appends turn to state
   - If `continue: false` (max turns or all-HOLD) → `status = "finished"`, stop auto-play
4. **Reset** → clears state; next `start()` calls `/api/reset` again

### Managed Mode (Teams.tsx)
1. **Home (/teams)** → Fetch `/api/managed/teams`, display list
2. **Team detail (/teams/:id)** → Fetch `/api/managed/teams/{id}`, show agents + conversations
3. **Create team** → Walk through 5-step wizard (team name → agent names → configure agents → group memories → scenario)
   - Provider setup in separate dialog (save provider keys, validate)
   - AI builder interview: `/api/managed/team-builder/chat` in a loop until `ready_to_build: true`
   - Final build: `/api/managed/team-builder/build` or manual team creation `/api/managed/teams` POST
4. **Launch conversation** → POST `/api/managed/teams/{id}/conversations` with participants + settings
5. **Conversation viewer (/teams/:id/conversations/:id)** → Fetch `/api/managed/conversations/{id}`, stream turns with advance button

---

## How to Add a New UI Element

### Adding a new decision field
1. Backend returns it in `decisions[id]` (verify in `server.py`)
2. Add to `Decision` type in `lib/types.ts`
3. Render in `UnderTheHoodPanel.tsx` → `<DecisionRow>`

### Adding a team form field
1. Add state variable in `Teams.tsx` (or hook if extracting)
2. Add input/textarea in the appropriate step (`createStep === 0/1/2/3/4`)
3. Update `createTeam()` POST body to include the field
4. Update `hydrateTeamEditor()` to load field on edit

### Adding a provider field
1. Add state in `Teams.tsx` provider management section
2. Update `createProviderConfig()` POST body
3. Update `ProvidersDialog` to render the new field

### Adding a new route/page
1. Create `pages/<PageName>.tsx`
2. Register in `App.tsx` `<Routes>`
3. Link from `TeamsPage` or `ChatHeader`

---

## Modification Reference Map

| If you want to… | Edit |
|-----------------|------|
| Show a new decision field | `lib/types.ts` → `UnderTheHoodPanel.tsx` |
| Change message appearance | `MessageBubble.tsx` |
| Change typing animation | `TypingIndicator.tsx` + `index.css` |
| Change avatar style | `AgentAvatar.tsx` |
| Change auto-play interval | `useSimulation.ts` (`setTimeout: 1500ms`) |
| Add a team form field | `Teams.tsx` (state + input + POST body + hydrate) |
| Add provider setting | `Teams.tsx` (provider state section) + `ProvidersDialog.tsx` |
| Add Managed Mode endpoint | Add action in `useManagedConversation.ts` or `Teams.tsx` + new route in `server.py` |
| Change theme/colors | `index.css` (CSS variables) + `tailwind.config.ts` |
| Add a new page | `pages/<Name>.tsx` + register in `App.tsx` |
| Tighten CORS | Backend `server.py` `allow_origins` |

---

## Debugging Checklist

### Classic Mode
| Symptom | Likely cause |
|---------|--------------|
| Header shows no agents | `/api/config` failed. Check backend on :8000 |
| "Start" button greyed | `config` null, `/api/config` not resolving |
| No avatars | `meta.bgColor` missing in `AGENT_COLORS` palette |
| "Next turn" → 500 | `/api/reset` not called or orchestrator is None |
| Penalty annotation missing | All wins non-consecutive or `effective_urgency === urgency` |
| Inner thought empty | Backend key mismatch (`reason` vs `inner_thought`) |

### Managed Mode
| Symptom | Likely cause |
|---------|--------------|
| Teams list blank | `/api/managed/teams` failed, check backend |
| Create dialog won't open | Provider validation failed; need at least one validated provider |
| AI builder blank | `/api/managed/team-builder/chat` failed; check model provider |
| API response mismatch | Field names wrong (e.g., `data.message` vs `data.assistant_message`). Update `lib/types.ts` |
| Dialog doesn't close | Confirm state still showing; check `setConfirmOpen(false)` is called |
| Conversation won't load | `/api/managed/conversations/{id}` failed; check `teamId` in URL |

---

## Design Principles

1. **No hardcoded IDs.** Use `/api/config`, `/api/managed/teams`, etc. for metadata — never a static list.
2. **Use relative `/api/...` URLs.** Vite proxy handles routing to :8000. Never hardcode localhost.
3. **Single source of state per feature.** `useSimulation` owns classic, `useManagedConversation` owns managed, `Teams.tsx` owns team CRUD.
4. **Backward-compatible field reads.** E.g., `inner_thought` is canonical, but fall back to `reason` if missing.
5. **Keep types in sync.** When backend changes a response shape, update `lib/types.ts` first — don't let it drift.
6. **Immutable state updates.** Append new turns, don't mutate existing ones. React relies on identity.
7. **Managed Mode is monolithic by design.** `Teams.tsx` handles all team/provider/builder state inline; breaking it into hooks is future refactor.
8. **API response field names matter.** Managed Mode endpoints use snake_case (`ready_to_build`, `missing_information`, `captured_summary`, `assistant_message`). Classic Mode uses lowercase (`winner`, `message`, `reason`).
