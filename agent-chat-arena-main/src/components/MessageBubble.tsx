import type { ChatMessage, AgentMeta } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";
import { cn } from "@/lib/utils";

interface Props {
  message: ChatMessage;
  meta: AgentMeta;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message, meta }: Props) {
  const isNarrator = message.speaker === "narrator";

  if (isNarrator) {
    return (
      <div className="flex justify-center animate-message-in">
        <div className="max-w-2xl text-center px-5 py-3 rounded-full glass border border-border/60">
          <span className="text-muted-foreground uppercase tracking-[0.18em] font-medium mr-2 text-xs">
            {meta?.emoji} Scene
          </span>
          <span className="text-sm text-muted-foreground">{message.text}</span>
        </div>
      </div>
    );
  }

  if (!meta) return null;

  return (
    <div className="flex gap-3 animate-message-in">
      <AgentAvatar meta={meta} size="md" />
      <div className="flex flex-col gap-1.5 min-w-0 max-w-[75%]">
        <div className="flex items-baseline gap-2">
          <span 
            className="font-display text-sm font-semibold"
            style={{ color: meta.themeColor }}
          >
            {meta.name}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {meta.role}
          </span>
          {message.turn !== undefined && (
            <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">
              T{message.turn}
            </span>
          )}
        </div>
        <div
          className="px-4 py-3 rounded-2xl rounded-tl-sm border shadow-bubble text-[15px] leading-relaxed text-foreground/95"
          style={{ backgroundColor: meta.bgColor, borderColor: meta.ringColor }}
        >
          {message.text}
        </div>
        <span className="text-[10px] text-muted-foreground/50 font-mono">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
