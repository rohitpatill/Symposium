import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentMeta, ChatMessage, SimulationConfig, Turn } from "@/lib/types";

type Status = "idle" | "running" | "thinking" | "paused" | "finished";

const NARRATOR_META: AgentMeta = {
  id: "narrator",
  name: "Narrator",
  role: "Scene",
  avatarUrl: "",
  initials: "NA",
  emoji: "✦",
  themeColor: "#888888",
  bgColor: "rgba(136, 136, 136, 0.1)",
  ringColor: "rgba(136, 136, 136, 0.4)",
};

export function useManagedConversation(conversationId?: string) {
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(-1);
  const [status, setStatus] = useState<Status>("idle");
  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const isRequestingRef = useRef(false);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/managed/conversations/${conversationId}`);
      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        throw new Error(failure.detail || "Failed to load conversation.");
      }
      const data = await res.json();
      const agents: Record<string, AgentMeta> = { narrator: NARRATOR_META };
      data.participants.forEach((participant: any, idx: number) => {
        const colors = [
          ["#E76F51", "rgba(231,111,81,0.1)", "rgba(231,111,81,0.4)"],
          ["#2A9D8F", "rgba(42,157,143,0.1)", "rgba(42,157,143,0.4)"],
          ["#E9C46A", "rgba(233,196,106,0.1)", "rgba(233,196,106,0.4)"],
          ["#264653", "rgba(38,70,83,0.1)", "rgba(38,70,83,0.4)"],
        ][idx % 4];
        agents[participant.slug] = {
          id: participant.slug,
          name: participant.display_name,
          role: participant.role || "",
          providerType: participant.provider_type || "openai",
          modelId: participant.model_id || "",
          avatarUrl: resolveAvatarUrl(participant.avatar_url || ""),
          initials: participant.display_name.slice(0, 2).toUpperCase(),
          emoji: "👤",
          themeColor: colors[0],
          bgColor: colors[1],
          ringColor: colors[2],
        };
      });
      setConfig({ agents, kickoff: data.conversation.scenario_prompt });
      setConversation(data.conversation);
      setTurns(data.turns);
      setCurrentTurnIndex(data.turns.length - 1);
      setMessages(
        data.messages
          .filter((message: any) => message.turn_number !== 0)
          .map((message: any, idx: number) => ({
            id: `${message.turn_number}-${idx}`,
            turn: message.turn_number,
            speaker: message.speaker_type === "narrator" ? "narrator" : data.participants.find((p: any) => p.id === message.participant_id)?.slug ?? "narrator",
            text: message.message_text,
            timestamp: Date.parse(message.created_at),
          })),
      );
      setStatus(data.conversation.status === "finished" ? "finished" : data.turns.length ? "running" : "idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = useCallback(async () => {
    if (!conversationId) return;
    setError(null);
    const res = await fetch(`/api/managed/conversations/${conversationId}/start`, { method: "POST" });
    if (!res.ok) {
      const failure = await res.json().catch(() => ({}));
      const message = failure.detail || "Failed to start conversation.";
      setError(message);
      setStatus("paused");
      return;
    }
    await load();
    setStatus("running");
  }, [conversationId, load]);

  const advance = useCallback(async () => {
    if (!conversationId || isRequestingRef.current || status === "finished") return;
    isRequestingRef.current = true;
    setStatus("thinking");
    setError(null);
    try {
      const res = await fetch(`/api/managed/conversations/${conversationId}/turn`, { method: "POST" });
      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        throw new Error(failure.detail || "Failed to advance conversation.");
      }
      const result = await res.json();
      const turn: Turn = result.data;
      setTurns((prev) => [...prev, turn]);
      if (turn.winner && turn.message) {
        setMessages((prev) => [...prev, {
          id: `turn-${turn.turn}`,
          turn: turn.turn,
          speaker: turn.winner,
          text: turn.message,
          timestamp: turn.timestamp,
        }]);
      }
      setCurrentTurnIndex((prev) => prev + 1);
      setStatus(result.continue ? "running" : "finished");
      setConversation((prev: any) => ({ ...prev, status: result.continue ? "running" : "finished" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance conversation.");
      setStatus("paused");
    } finally {
      isRequestingRef.current = false;
    }
  }, [conversationId, status]);

  const currentTurn = useMemo(() => currentTurnIndex >= 0 ? turns[currentTurnIndex] : undefined, [currentTurnIndex, turns]);

  return {
    config,
    messages,
    turns,
    currentTurn,
    currentTurnIndex,
    setCurrentTurnIndex,
    status,
    conversation,
    totalTurns: conversation?.settings?.max_turns ?? 20,
    error,
    loading,
    isThinking: status === "thinking",
    hasStarted: status !== "idle",
    start,
    advance,
    reload: load,
  };
}

function resolveAvatarUrl(value: string) {
  if (!value) return "";
  if (value.startsWith("/uploads/")) {
    return `http://127.0.0.1:8000${value}`;
  }
  return value;
}
