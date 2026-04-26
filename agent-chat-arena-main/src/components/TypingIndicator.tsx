import type { AgentMeta } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";

interface Props {
  speakingAgents: AgentMeta[];
}

export function TypingIndicator({ speakingAgents }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 animate-fade-in pl-1">
      <div className="flex items-center -space-x-2">
        {speakingAgents.map((meta) => (
          <AgentAvatar key={meta.id} meta={meta} size="sm" ring className="h-9 w-9 border-2 border-background" />
        ))}
      </div>
      <div className="flex min-h-11 items-center gap-2 rounded-full border border-border/60 px-4 py-2.5 glass">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">Agents are deliberating</span>
        <span className="flex items-center gap-1 text-primary">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
      </div>
    </div>
  );
}
