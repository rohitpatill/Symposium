import type { AgentMeta } from "@/lib/types";

interface Props {
  speakingAgents: AgentMeta[];
}

export function TypingIndicator({ speakingAgents }: Props) {
  return (
    <div className="flex items-center gap-3 animate-fade-in pl-1">
      <div className="flex -space-x-2">
        {speakingAgents.map((meta) => (
          <div
            key={meta.id}
            className="h-7 w-7 rounded-full ring-2 ring-background flex items-center justify-center text-[9px] font-display font-semibold text-white"
            style={{ backgroundColor: meta.themeColor }}
          >
            {meta.initials}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-full glass border border-border/60">
        <span className="text-xs text-muted-foreground font-medium">Agents are deliberating</span>
        <span className="flex items-center gap-1 text-primary">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
      </div>
    </div>
  );
}
