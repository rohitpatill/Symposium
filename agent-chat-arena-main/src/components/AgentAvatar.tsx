import type { AgentMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  meta: AgentMeta;
  size?: "sm" | "md" | "lg";
  ring?: boolean;
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
};

export function AgentAvatar({ meta, size = "md", ring, className }: Props) {
  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full font-display font-semibold text-white",
        "flex items-center justify-center shadow-bubble",
        sizes[size],
        ring && "ring-2 ring-offset-2 ring-offset-background",
        className,
      )}
      style={{
        backgroundColor: meta.themeColor,
        ...(ring ? { "--tw-ring-color": meta.ringColor } as React.CSSProperties : {})
      }}
      title={`${meta.name} — ${meta.role}`}
    >
      <span className="drop-shadow-sm">{meta.initials}</span>
    </div>
  );
}
