import { ArrowLeft, Brain } from "lucide-react";
import { Link } from "react-router-dom";
import type { TeamSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";

type TeamsHomeViewProps = {
  teams: TeamSummary[];
  onOpenCreateTeam: (event: React.MouseEvent<HTMLButtonElement>) => void;
  providersTrigger: React.ReactNode;
};

export function TeamsHomeView({ teams, onOpenCreateTeam, providersTrigger }: TeamsHomeViewProps) {
  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <main className="rounded-[24px] border border-border/60 p-5 glass-strong xl:p-6">
        <div className="space-y-6">
          <section className="rounded-[24px] border border-border/60 bg-background/30 p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <Brain className="h-3.5 w-3.5" />
                  Managed mode
                </div>
                <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Symposium
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Build reusable agent teams, launch conversations from curated subsets, save every turn, and inspect the exact thoughts and floor decisions later. The default markdown workflow stays available quietly in the background, but this is now the main workspace.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {providersTrigger}
                <Button className="rounded-xl" onClick={onOpenCreateTeam}>
                  Create team
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {teams.map((team) => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className="group rounded-[22px] border border-border/50 bg-background/30 p-5 transition-colors hover:border-primary/40 hover:bg-card/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-xl font-semibold transition-colors group-hover:text-foreground">{team.name}</div>
                    <div className="mt-3 text-sm leading-7 text-muted-foreground">
                      {team.description || "No description yet."}
                    </div>
                  </div>
                  <ArrowLeft className="h-4 w-4 shrink-0 rotate-180 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
            {teams.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-border/60 bg-background/20 p-6 text-sm leading-7 text-muted-foreground md:col-span-2 2xl:col-span-3">
                No teams yet. Start by setting up a provider and creating your first team.
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
