import type { ManagedAgentDraft } from "@/lib/types";

export function blankAgent(name = ""): ManagedAgentDraft {
  return {
    display_name: name,
    avatar_url: "",
    provider_config_id: null,
    provider_type: "openai",
    model_id: "",
    role: "",
    core_personality: "",
    talkativeness: 0.5,
    speech_style: "",
    private_goal: "",
    values_text: "",
    handling_defeat: "",
    urgency_tendency: "",
    extra_notes: "",
    personal_memory: "",
    memories: [],
    personas: {},
  };
}

export function resolveManagedAssetUrl(value?: string | null) {
  if (!value) return "";
  if (value.startsWith("/uploads/")) {
    return `http://127.0.0.1:8000${value}`;
  }
  return value;
}

export function truncateText(value?: string | null, limit = 90) {
  const text = (value || "").trim();
  if (!text) return "No personality summary yet.";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}...`;
}
