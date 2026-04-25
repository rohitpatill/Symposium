# Lovable React UI Prompt: Agent Teams Frontend

## Project Overview
We are building a React frontend for **Agent Teams**, a backend Python framework that simulates realistic group conversations between multiple AI agents. The agents have competing goals, asymmetric information, and social dynamics. 

Currently, the backend reads all agent personalities, memories, and shared contexts locally from the file system. The frontend's primary job is to **visualize the simulation as it runs**—acting as a beautiful, modern group chat interface where the user can watch the AI agents talk to each other in real-time.

## Backend Context & Architecture
The Python backend uses a **Two-Phase Sequential Floor Protocol**:
1. **Phase 1 (Decision):** All agents decide in parallel whether to `HOLD` (stay silent) or `SPEAK`. If they want to speak, they provide an `urgency` score (0-10) and a `reason`.
2. **Phase 2 (Response):** The agent with the highest urgency wins the floor and generates a `message`. The losers' reasons are stored as private "held thoughts".

**The Agents (Hardcoded for now):**
1. **Aarav:** Extroverted, adventurous, impulsive. Pushes for exciting trips (like trekking).
2. **Priya:** Cautious, organized, planner. Wants safe, predictable trips.
3. **Kabir:** Foodie, peacemaker. Cares mostly about restaurant quality.

## UI Requirements & Features
We want a modern, highly polished, and responsive React application. There is **no authentication or login**.

### 1. Main View: The Group Chat
- A beautiful chat interface resembling a modern messaging app (like WhatsApp, iMessage, or Discord).
- **Message Bubbles:** Should clearly indicate who is speaking. Since this is a group chat, use different colors or avatar placeholders for Aarav, Priya, Kabir, and the "Narrator" (system messages like the scenario kickoff).
- **Hardcoded Icons/Avatars:** Please provide nice default avatar icons/colors for Aarav, Priya, and Kabir.
- **Auto-scroll:** The chat should automatically scroll to the bottom as new messages arrive.
- **Typing Indicators:** When the backend is processing a turn, show an animated typing indicator (e.g., "Aarav is typing..." or a generic "Agents are thinking...").

### 2. Simulation Controls
- A simple header or sidebar with controls to interact with the backend API:
  - **Start Conversation:** A button to trigger the API to start the simulation.
  - **Next Turn / Auto-Play:** Controls to either step through the conversation turn-by-turn or let it auto-play.

### 3. "Under the Hood" Side Panel (Optional but Highly Desired)
- While the main chat shows the *actual* messages, it would be incredible to have a togglable right sidebar or developer panel that shows the **Phase 1 Decisions** for the current turn.
- Show who decided to `HOLD` and who decided to `SPEAK`.
- Visualize the `urgency` scores (e.g., progress bars) so we can see how the agents are competing for the floor.
- Show the "held thoughts" of the agents who lost the bid to speak.

## Data Integration (Mocking the API)
The frontend will eventually connect to a backend API (e.g., `GET /api/chat`, `POST /api/turn`). 
For now, please build the UI using a mock state/hook that simulates the backend sending payloads. 

A standard payload for a completed turn looks like this:
```json
{
  "turn": 1,
  "winner": "Aarav",
  "message": "Guys, I'm thinking we should totally go trekking in Himachal Pradesh this weekend! 🏞️",
  "decisions": {
    "aarav": { "decision": "SPEAK", "urgency": 8.5, "reason": "I want to push for a trekking trip" },
    "priya": { "decision": "HOLD" },
    "kabir": { "decision": "SPEAK", "urgency": 7.2, "reason": "I want to suggest Goa for the food" }
  }
}
```

## Design Aesthetic
- **Vibe:** Sleek, modern, and engaging.
- **Styling:** Use Tailwind CSS or similar modern utility classes. 
- **Animations:** Smooth transitions for new messages entering the chat. 

Please generate the complete React scaffolding, components, and state management to bring this design to life!
