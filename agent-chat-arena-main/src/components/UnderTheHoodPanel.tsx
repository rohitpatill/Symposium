import type { Turn, SimulationConfig, AgentMeta, Decision } from "@/lib/types";
import { AgentAvatar } from "./AgentAvatar";
import { Mic, MicOff, Trophy, Activity, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  currentTurn?: Turn;
  isThinking: boolean;
  totalTurns: number;
  config: SimulationConfig | null;
}

export function UnderTheHoodPanel({ currentTurn, isThinking, totalTurns, config }: Props) {
  const speakingAgents = config ? Object.values(config.agents).filter(a => a.id !== "narrator") : [];

  return (
    <aside className="h-full glass-strong border-l border-border/60 flex flex-col">
      <div className="px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-display font-semibold text-sm uppercase tracking-wider">
            Under the Hood
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Phase 1 decisions · Floor protocol
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-5">
        {!currentTurn && !isThinking && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <div className="inline-flex h-12 w-12 rounded-full bg-muted/40 items-center justify-center mb-3">
              <Activity className="h-5 w-5 opacity-50" />
            </div>
            <p>Start the conversation to inspect the agents' decisions in real time.</p>
          </div>
        )}

        {isThinking && (
          <div className="space-y-3 animate-fade-in">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Phase 1 in progress
            </div>
            {speakingAgents.map((meta) => (
              <div key={meta.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
                <AgentAvatar meta={meta} size="sm" />
                <div className="flex-1">
                  <div className="text-xs font-medium">{meta.name}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    <span className="ml-1">deciding…</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentTurn && !isThinking && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Turn
              </span>
              <span className="font-mono text-xs text-foreground">
                {String(currentTurn.turn).padStart(2, "0")} / {String(totalTurns).padStart(2, "0")}
              </span>
            </div>

            <div className="space-y-2.5">
              {speakingAgents.map((meta) => (
                <DecisionRow
                  key={meta.id}
                  meta={meta}
                  decision={currentTurn.decisions[meta.id]}
                  isWinner={currentTurn.winner === meta.id}
                />
              ))}
            </div>

            <HeldThoughts turn={currentTurn} speakingAgents={speakingAgents} />
          </>
        )}
      </div>
    </aside>
  );
}

function DecisionRow({
  meta, decision, isWinner,
}: { meta: AgentMeta; decision?: Decision; isWinner: boolean }) {
  const isSpeak = decision?.decision === "SPEAK";
  const rawUrgency = decision?.urgency ?? 0;
  const effectiveUrgency = decision?.effective_urgency ?? rawUrgency;
  const penaltyMultiplier = decision?.penalty_multiplier ?? 1.0;
  const penaltyApplied = penaltyMultiplier !== 1.0 && rawUrgency > 0;
  const penaltyDelta = effectiveUrgency - rawUrgency;
  const penaltyReason = decision?.penalty_reason ?? "";
  const thoughtText = decision?.inner_thought ?? decision?.reason;

  return (
    <div
      className={cn(
        "p-3.5 rounded-xl border transition-all",
        isWinner
          ? "ring-1"
          : "bg-muted/20 border-border/40",
      )}
      style={isWinner ? { backgroundColor: meta.bgColor, borderColor: meta.ringColor, "--tw-ring-color": meta.ringColor } as React.CSSProperties : {}}
    >
      <div className="flex items-center gap-3 mb-2">
        <AgentAvatar meta={meta} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="font-display text-sm font-semibold"
              style={{ color: meta.themeColor }}
            >
              {meta.name}
            </span>
            {isWinner && (
              <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold text-primary">
                <Trophy className="h-2.5 w-2.5" /> Floor
              </span>
            )}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium",
            isSpeak
              ? "bg-primary/15 text-primary"
              : "bg-muted/60 text-muted-foreground",
          )}
        >
          {isSpeak ? <Mic className="h-2.5 w-2.5" /> : <MicOff className="h-2.5 w-2.5" />}
          {decision?.decision ?? "—"}
        </span>
      </div>

      {isSpeak && (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full rounded-full animate-urgency-fill"
                style={{ width: `${(effectiveUrgency / 10) * 100}%`, backgroundColor: meta.themeColor }}
              />
            </div>
            <div className="flex items-baseline gap-1.5 tabular-nums">
              {penaltyApplied ? (
                <>
                  <span className="font-mono text-[10px] text-muted-foreground/50 line-through">
                    {rawUrgency.toFixed(2)}
                  </span>
                  <span className="font-mono text-[11px] text-foreground/90 font-medium">
                    {effectiveUrgency.toFixed(2)}
                  </span>
                </>
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {rawUrgency.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {penaltyApplied && (
            <div className="flex items-center gap-1 mb-1.5 text-[10px] text-amber-500/90 font-mono">
              <Zap className="h-2.5 w-2.5" />
              <span>{penaltyDelta.toFixed(2)} · {penaltyReason}</span>
            </div>
          )}

          {thoughtText && (
            <p className="text-xs text-muted-foreground/90 leading-relaxed pl-0.5">
              <span className="text-muted-foreground/60 italic">"</span>
              {thoughtText}
              <span className="text-muted-foreground/60 italic">"</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function HeldThoughts({ turn, speakingAgents }: { turn: Turn, speakingAgents: AgentMeta[] }) {
  const losers = speakingAgents.filter(
    (meta) => meta.id !== turn.winner && turn.decisions[meta.id]?.decision === "SPEAK"
  );
  if (losers.length === 0) return null;

  return (
    <div className="pt-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
        Held thoughts
      </div>
      <div className="space-y-2">
        {losers.map((meta) => (
          <div key={meta.id} className="p-3 rounded-lg bg-muted/20 border border-dashed border-border/60">
            <div 
              className="text-[11px] font-display font-semibold mb-1"
              style={{ color: meta.themeColor }}
            >
              {meta.name} (silent)
            </div>
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              {turn.decisions[meta.id]?.inner_thought ?? turn.decisions[meta.id]?.reason}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
