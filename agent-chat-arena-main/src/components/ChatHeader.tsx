import { Play, SkipForward, RotateCcw, Pause, Sparkles, PanelRightOpen, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { SimulationConfig } from "@/lib/types";

interface Props {
  hasStarted: boolean;
  isThinking: boolean;
  status: string;
  autoPlay: boolean;
  setAutoPlay: (v: boolean) => void;
  onStart: () => void;
  onAdvance: () => void;
  onReset: () => void;
  totalTurns: number;
  completedTurns: number;
  panelOpen: boolean;
  togglePanel: () => void;
  config: SimulationConfig | null;
}

export function ChatHeader({
  hasStarted, isThinking, status, autoPlay, setAutoPlay,
  onStart, onAdvance, onReset, totalTurns, completedTurns,
  panelOpen, togglePanel, config,
}: Props) {
  const finished = status === "finished";
  const speakingAgents = config ? Object.values(config.agents).filter(a => a.id !== "narrator") : [];

  return (
    <header className="glass-strong border-b border-border/60 px-4 sm:px-6 py-3.5 flex items-center gap-3 sm:gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-lg sm:text-xl font-semibold leading-tight truncate">
            Simulation
          </h1>
          <div className="flex items-center gap-1.5">
            {speakingAgents.map((meta, idx) => (
              <span key={meta.id} className="text-[11px] font-medium" style={{ color: meta.themeColor }}>
                {meta.name}
                {idx !== speakingAgents.length - 1 && <span className="text-muted-foreground/40 mx-1">·</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 ml-2 px-3 py-1.5 rounded-full bg-muted/40 border border-border/60">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
        <span className="text-xs font-mono text-muted-foreground">
          Turn {completedTurns}/{totalTurns}
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {!hasStarted ? (
          <Button onClick={onStart} className="bg-gradient-primary text-primary-foreground hover:opacity-90 font-medium shadow-glow" disabled={!config}>
            <Play className="h-4 w-4 mr-1.5" /> Start conversation
          </Button>
        ) : (
          <>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/60">
              <span className="text-xs text-muted-foreground">Auto-play</span>
              <Switch checked={autoPlay} onCheckedChange={setAutoPlay} disabled={finished} />
            </div>
            <Button
              variant="secondary"
              onClick={onAdvance}
              disabled={isThinking || finished || autoPlay}
              className="font-medium"
            >
              {isThinking ? (
                <Pause className="h-4 w-4 mr-1.5 animate-pulse" />
              ) : (
                <SkipForward className="h-4 w-4 mr-1.5" />
              )}
              Next turn
            </Button>
            <Button variant="ghost" size="icon" onClick={onReset} title="Reset">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePanel}
          className="lg:flex hidden"
          title={panelOpen ? "Hide dev panel" : "Show dev panel"}
        >
          {panelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
