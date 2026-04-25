import { ArrowRight, Database, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="rounded-[28px] border border-border/60 glass-strong p-8 sm:p-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Symposium
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            A multi-agent orchestration framework simulating realistic human group dynamics. Keep the fast default sandbox for ad-hoc markdown experiments, or move into managed teams and conversations when you want reusable setups, history, and deeper analysis.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <Link
            to="/default"
            className="group rounded-[24px] border border-border/60 bg-card/60 p-7 transition-colors hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Current workflow
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-semibold">Default Chat</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Uses the current markdown files exactly as they exist now. No database, no saved records, just the existing simulation flow.
            </p>
          </Link>

          <Link
            to="/teams"
            className="group rounded-[24px] border border-border/60 bg-card/60 p-7 transition-colors hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                <Database className="h-3.5 w-3.5" />
                Managed mode
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-semibold">Teams & Conversations</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Build reusable agent teams, launch conversations from subsets, save every turn, and inspect the exact thoughts and floor decisions later.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
