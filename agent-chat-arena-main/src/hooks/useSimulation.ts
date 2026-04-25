import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Turn, SimulationConfig, AgentMeta } from "@/lib/types";

type Status = "idle" | "running" | "thinking" | "paused" | "finished";

const NARRATOR_META: AgentMeta = {
  id: "narrator",
  name: "Narrator",
  role: "Scene",
  initials: "NA",
  emoji: "✦",
  themeColor: "#888888",
  bgColor: "rgba(136, 136, 136, 0.1)",
  ringColor: "rgba(136, 136, 136, 0.4)",
};

export function useSimulation() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(-1);
  const [status, setStatus] = useState<Status>("idle");
  const [autoPlay, setAutoPlay] = useState(false);
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const isRequestingRef = useRef<boolean>(false);

  // Fetch dynamic configuration on load
  useEffect(() => {
    fetch("/api/config")
      .then(res => res.json())
      .then(data => {
        if (data.status === "ok") {
          // add narrator meta to agents for UI ease
          data.agents["narrator"] = NARRATOR_META;
          setConfig({
            agents: data.agents,
            kickoff: data.kickoff || "The agents are ready. Watch them negotiate."
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingConfig(false));
  }, []);

  const reset = useCallback(() => {
    isRequestingRef.current = false;
    setMessages([]);
    setTurns([]);
    setCurrentTurnIndex(-1);
    setStatus("idle");
    setAutoPlay(false);
  }, []);

  const start = useCallback(async () => {
    if (!config) return;
    reset();
    setStatus("thinking");
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (!res.ok) throw new Error("Failed to reset backend");
      
      setMessages([
        {
          id: "intro",
          speaker: "narrator",
          text: config.kickoff,
          timestamp: Date.now(),
        },
      ]);
      setStatus("running");
    } catch (err) {
      console.error(err);
      setStatus("idle");
    }
  }, [reset, config]);

  const advance = useCallback(async () => {
    if (isRequestingRef.current || status === "finished") return;
    isRequestingRef.current = true;
    setStatus("thinking");

    try {
      const res = await fetch("/api/turn", { method: "POST" });
      if (!res.ok) throw new Error("Failed to advance turn");
      const result = await res.json();
      
      const turn: Turn = result.data;
      
      if (turn && turn.turn) {
        setTurns((t) => [...t, turn]);
        
        if (turn.winner && turn.message) {
          setMessages((m) => [
            ...m,
            {
              id: `t${turn.turn}`,
              turn: turn.turn,
              speaker: turn.winner,
              text: turn.message,
              timestamp: turn.timestamp,
            },
          ]);
        }
        setCurrentTurnIndex((prev) => prev + 1);
      }
      
      if (!result.continue) {
        setStatus("finished");
        setAutoPlay(false);
      } else {
        setStatus("running");
      }
    } catch (err) {
      console.error(err);
      setStatus("paused");
      setAutoPlay(false);
    } finally {
      isRequestingRef.current = false;
    }
  }, [status]);

  // Auto-play loop
  useEffect(() => {
    if (!autoPlay) return;
    if (status !== "running") return;
    
    const id = window.setTimeout(() => advance(), 1500);
    return () => window.clearTimeout(id);
  }, [autoPlay, status, advance]);

  const currentTurn = currentTurnIndex >= 0 ? turns[currentTurnIndex] : undefined;
  const isThinking = status === "thinking";
  const hasStarted = status !== "idle";

  return {
    config,
    loadingConfig,
    messages,
    turns,
    currentTurn,
    status,
    isThinking,
    hasStarted,
    autoPlay,
    setAutoPlay,
    start,
    advance,
    reset,
    totalTurns: 20,
    completedTurns: turns.length,
  };
}
