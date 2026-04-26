import type { AgentId } from "./agents";

export interface AgentMeta {
  id: AgentId;
  name: string;
  role: string;
  providerType?: string;
  modelId?: string;
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

export interface ManagedAgentDraft {
  display_name: string;
  provider_config_id?: number | null;
  provider_type?: string;
  model_id?: string;
  role: string;
  core_personality: string;
  talkativeness: number;
  speech_style: string;
  private_goal: string;
  values_text: string;
  handling_defeat: string;
  urgency_tendency: string;
  extra_notes: string;
  personal_memory: string;
  memories: Array<{
    type: string;
    target_agent_slug?: string | null;
    title: string;
    content: string;
  }>;
  personas: Record<string, string>;
}

export interface ManagedGroupMemoryDraft {
  title: string;
  content: string;
  participant_slugs: string[];
  is_general: boolean;
}

export interface TeamSummary {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface TeamAgentSummary {
  id: number;
  slug: string;
  display_name: string;
  provider_config_id?: number | null;
  provider_type?: string;
  model_id?: string;
  role: string;
  core_personality: string;
  talkativeness: number;
  speech_style?: string;
  private_goal?: string;
  values_text?: string;
  handling_defeat?: string;
  urgency_tendency?: string;
  extra_notes?: string;
  personal_memory?: string;
  memories?: Array<{
    type: string;
    target_agent_slug?: string | null;
    title: string;
    content: string;
  }>;
  personas?: Record<string, string>;
  sort_order: number;
}

export interface ConversationSummary {
  id: number;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TeamDetailResponse {
  team: TeamSummary;
  agents: TeamAgentSummary[];
  conversations: ConversationSummary[];
  scenarioTemplate: string;
  groupMemories?: ManagedGroupMemoryDraft[];
}

export interface ProviderConfigSummary {
  id: number;
  provider_type: string;
  display_name: string;
  is_valid: number;
  validation_error: string;
  validated_at?: string | null;
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  supports_prompt_caching: boolean;
  prompt_caching_mode: string;
  models: Array<{
    model_id: string;
    name: string;
    input: number;
    output: number;
  }>;
}
