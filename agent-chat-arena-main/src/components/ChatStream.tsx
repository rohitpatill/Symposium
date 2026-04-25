import { useEffect, useRef } from "react";
import type { ChatMessage, SimulationConfig } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Sparkles } from "lucide-react";

interface Props {
  messages: ChatMessage[];
  isThinking: boolean;
  hasStarted: boolean;
  config: SimulationConfig | null;
}

export function ChatStream({ messages, isThinking, hasStarted, config }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isThinking]);

  if (!hasStarted) {
    const agentNames = config 
      ? Object.values(config.agents).filter(a => a.id !== "narrator").map(a => a.name).join(", ")
      : "Agents";
      
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md animate-fade-in">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-gradient-primary items-center justify-center mb-5 shadow-glow">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-3 tracking-tight">
            Watch the agents negotiate.
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {agentNames} are ready to talk.
            <br/>Press <span className="text-primary font-medium">Start conversation</span> and
            see the floor protocol decide who speaks each turn.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        {messages.map((m) => (
          <MessageBubble 
            key={m.id} 
            message={m} 
            meta={config?.agents[m.speaker]!} 
          />
        ))}
        {isThinking && config && (
          <TypingIndicator 
            speakingAgents={Object.values(config.agents).filter((a) => a.id !== "narrator")} 
          />
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
