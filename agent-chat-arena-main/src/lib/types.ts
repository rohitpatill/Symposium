import type { AgentId } from "./agents";

export interface AgentMeta {
  id: AgentId;
  name: string;
  role: string;
  initials: string;
  emoji: string;
  themeColor: string;
  bgColor: string;
  ringColor: string;
}

export interface Decision {
  decision: "SPEAK" | "HOLD";
  urgency?: number;             // raw, self-reported by the agent
  effective_urgency?: number;   // after consecutive-speaker penalty
  penalty_multiplier?: number;  // e.g. 0.85 means 15% penalty applied
  penalty_reason?: string;      // human-readable, e.g. "won previous turn"
  consecutive_wins_before?: number;
  reason?: string;              // backward-compat alias for inner_thought
  inner_thought?: string;       // private reflection — what the agent thought
}

export interface Turn {
  turn: number;
  winner: AgentId | null;
  message: string;
  decisions: Partial<Record<AgentId, Decision>>;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  turn?: number;
  speaker: AgentId;
  text: string;
  timestamp: number;
}

export interface SimulationConfig {
  agents: Record<AgentId, AgentMeta>;
  kickoff: string;
}
