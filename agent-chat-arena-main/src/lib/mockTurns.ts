import type { Turn } from "./types";

/** Mocked sequence of turns simulating the backend Two-Phase Floor Protocol. */
export const MOCK_TURNS: Omit<Turn, "timestamp">[] = [
  {
    turn: 1,
    winner: "aarav",
    message:
      "Guys, I'm thinking we should totally go trekking in Himachal this weekend! 🏞️ The weather is perfect right now.",
    decisions: {
      aarav: { decision: "SPEAK", urgency: 8.5, reason: "Want to push hard for an adventurous trek before monsoon hits." },
      priya: { decision: "HOLD" },
      kabir: { decision: "SPEAK", urgency: 7.2, reason: "Want to redirect toward Goa — the food scene there is unbeatable." },
    },
  },
  {
    turn: 2,
    winner: "priya",
    message:
      "Hold on — Himachal in this season? We'd need permits, gear rental, and the road conditions are unpredictable. Can we look at something more structured?",
    decisions: {
      aarav: { decision: "HOLD" },
      priya: { decision: "SPEAK", urgency: 9.1, reason: "Critical to surface logistics risks before the group commits." },
      kabir: { decision: "SPEAK", urgency: 6.4, reason: "Still want to nudge toward a food-first destination." },
    },
  },
  {
    turn: 3,
    winner: "kabir",
    message:
      "Okay okay, peace 🙏 — what if we did a long weekend in Pondicherry? Trek-light, beach, and the French Quarter cafes are unreal.",
    decisions: {
      aarav: { decision: "SPEAK", urgency: 7.8, reason: "Pondy is fine but I want at least one adventure activity baked in." },
      priya: { decision: "HOLD" },
      kabir: { decision: "SPEAK", urgency: 8.9, reason: "Compromise opportunity — food destination that both sides can accept." },
    },
  },
  {
    turn: 4,
    winner: "aarav",
    message:
      "Pondy could work IF we add scuba at Paradise Beach. Otherwise I'll fall asleep in a cafe 😅",
    decisions: {
      aarav: { decision: "SPEAK", urgency: 8.2, reason: "Need to anchor an adventure component into the plan." },
      priya: { decision: "SPEAK", urgency: 7.5, reason: "Want to flag scuba certification requirements." },
      kabir: { decision: "HOLD" },
    },
  },
  {
    turn: 5,
    winner: "priya",
    message:
      "Scuba needs prior certification or a full-day intro course. I'll draft a 3-day itinerary tonight — flights, stays, one adventure block, two food blocks. Cool?",
    decisions: {
      aarav: { decision: "HOLD" },
      priya: { decision: "SPEAK", urgency: 9.4, reason: "Time to consolidate — propose a concrete itinerary before momentum dies." },
      kabir: { decision: "SPEAK", urgency: 6.1, reason: "Wanted to suggest specific restaurants but Priya's plan covers it." },
    },
  },
];
