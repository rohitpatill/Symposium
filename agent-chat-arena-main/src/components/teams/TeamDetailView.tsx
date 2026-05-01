import type React from "react";
import { ArrowLeft, Pencil, Trash2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { TeamDetailResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./Field";
import { resolveManagedAssetUrl, truncateText } from "./utils";

type TeamDetailViewProps = {
  detail: TeamDetailResponse;
  providersTrigger: React.ReactNode;
  createTeamTrigger: React.ReactNode;
  openEditTeam: () => void;
  deleteTeam: () => void;
  openEditTeamAgent: (index: number) => void;
  deleteAgent: (slug: string, displayName: string) => void | Promise<void>;
  openEditTeamScenario: () => void;
  launchOpen: boolean;
  setLaunchOpen: (value: boolean) => void;
  launchTitle: string;
  setLaunchTitle: (value: string) => void;
  launchScenario: string;
  setLaunchScenario: (value: string) => void;
  launchParticipants: string[];
  setLaunchParticipants: React.Dispatch<React.SetStateAction<string[]>>;
  maxTurns: number;
  setMaxTurns: (value: number) => void;
  allHoldTermination: number;
  setAllHoldTermination: (value: number) => void;
  consecutivePenalty: boolean;
  setConsecutivePenalty: (value: boolean) => void;
  penalty1: number;
  setPenalty1: (value: number) => void;
  penalty2: number;
  setPenalty2: (value: number) => void;
  penalty3: number;
  setPenalty3: (value: number) => void;
  startConversation: () => void | Promise<void>;
  prepareLaunchDialog: () => void;
};

export function TeamDetailView(props: TeamDetailViewProps) {
  const {
    detail,
    providersTrigger,
    createTeamTrigger,
    openEditTeam,
    deleteTeam,
    openEditTeamAgent,
    deleteAgent,
    openEditTeamScenario,
    launchOpen,
    setLaunchOpen,
    launchTitle,
    setLaunchTitle,
    launchScenario,
    setLaunchScenario,
    launchParticipants,
    setLaunchParticipants,
    maxTurns,
    setMaxTurns,
    allHoldTermination,
    setAllHoldTermination,
    consecutivePenalty,
    setConsecutivePenalty,
    penalty1,
    setPenalty1,
    penalty2,
    setPenalty2,
    penalty3,
    setPenalty3,
    startConversation,
    prepareLaunchDialog,
  } = props;

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <main className="rounded-[24px] border border-border/60 p-5 glass-strong xl:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            All teams
          </Link>
          <div className="flex gap-2">
            {providersTrigger}
            {createTeamTrigger}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-[22px] border border-border/60 bg-background/30 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Users className="h-3.5 w-3.5" />
                {detail.agents.length} agents
              </div>
              <h2 className="mt-4 font-display text-3xl font-semibold">{detail.team.name}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
                {detail.team.description || "No description added yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={openEditTeam}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit team
              </Button>
              <Button variant="ghost" onClick={deleteTeam}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete team
              </Button>
              <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
                <DialogTrigger asChild>
                  <Button onClick={prepareLaunchDialog}>Start new conversation</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-border/60 glass-strong">
                  <DialogHeader>
                    <DialogTitle>Launch conversation</DialogTitle>
                    <DialogDescription>
                      Pick the subset for this run and lock the scenario before the first turn.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5">
                    <Field label="Conversation title" hint="Used in conversation history and analysis views.">
                      <Input value={launchTitle} onChange={(e) => setLaunchTitle(e.target.value)} />
                    </Field>
                    <Field label="Scenario / kickoff" hint="This becomes the narrator setup for the run and stays frozen once it starts.">
                      <Textarea value={launchScenario} onChange={(e) => setLaunchScenario(e.target.value)} className="min-h-32" />
                    </Field>
                    <div className="space-y-3">
                      <div className="text-sm font-medium">Participants</div>
                      {detail.agents.map((agent) => (
                        <label key={agent.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 px-3 py-2">
                          <Checkbox
                            checked={launchParticipants.includes(agent.slug)}
                            onCheckedChange={(checked) =>
                              setLaunchParticipants((prev) => checked ? [...prev, agent.slug] : prev.filter((slug) => slug !== agent.slug))
                            }
                          />
                          <div>
                            <div className="text-sm font-medium">{agent.display_name}</div>
                            <div className="text-xs text-muted-foreground">{agent.role}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
                      <div className="mb-3 text-sm font-medium">Conversation settings</div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Max turns" hint="Hard stop for this conversation only. Default mode stays unchanged.">
                          <Input type="number" min={1} max={100} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} />
                        </Field>
                        <Field label="All-HOLD termination" hint="Stop after this many fully silent turns in a row.">
                          <Input type="number" min={1} max={20} value={allHoldTermination} onChange={(e) => setAllHoldTermination(Number(e.target.value))} />
                        </Field>
                      </div>
                      <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-4">
                        <label className="flex items-start gap-3">
                          <Checkbox checked={consecutivePenalty} onCheckedChange={(checked) => setConsecutivePenalty(Boolean(checked))} />
                          <div>
                            <div className="text-sm font-medium">Consecutive-speaker penalty</div>
                            <p className="text-xs leading-6 text-muted-foreground">
                              Models real-group social pressure: dominant speakers face increasing pressure to yield the floor.
                            </p>
                          </div>
                        </label>
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                          <Field label="After 1 win" hint="Multiplier after winning the previous turn.">
                            <Input type="number" min={0} max={1} step={0.01} value={penalty1} onChange={(e) => setPenalty1(Number(e.target.value))} disabled={!consecutivePenalty} />
                          </Field>
                          <Field label="After 2 wins" hint="Multiplier after winning two turns in a row.">
                            <Input type="number" min={0} max={1} step={0.01} value={penalty2} onChange={(e) => setPenalty2(Number(e.target.value))} disabled={!consecutivePenalty} />
                          </Field>
                          <Field label="After 3+ wins" hint="Multiplier after a long streak.">
                            <Input type="number" min={0} max={1} step={0.01} value={penalty3} onChange={(e) => setPenalty3(Number(e.target.value))} disabled={!consecutivePenalty} />
                          </Field>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={startConversation} disabled={launchParticipants.length < 2}>Start</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-[22px] border border-border/60 bg-background/30 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-semibold">Agents</h3>
                <div className="text-xs text-muted-foreground">Click a card to open the full editor</div>
              </div>
              <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {detail.agents.map((agent, index) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => openEditTeamAgent(index)}
                    className="w-full rounded-2xl border border-border/50 bg-card/50 p-4 text-left transition-colors hover:border-primary/40 hover:bg-card/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border/60 bg-background/40 sm:h-14 sm:w-14">
                        {agent.avatar_url ? (
                          <img src={resolveManagedAssetUrl(agent.avatar_url)} alt={agent.display_name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                            {agent.display_name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="truncate text-base font-medium sm:text-lg">{agent.display_name}</div>
                                <div className="mt-1 text-[11px] uppercase leading-5 tracking-[0.14em] text-primary/80 sm:text-xs">{agent.role}</div>
                              </div>
                              <div className="hidden shrink-0 text-right text-[11px] leading-5 text-muted-foreground sm:block">
                                <div>Talkativeness {agent.talkativeness.toFixed(2)}</div>
                                <div>{(agent.provider_type || "openai").toUpperCase()}</div>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={(e) => { e.stopPropagation(); openEditTeamAgent(index); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={(e) => { e.stopPropagation(); void deleteAgent(agent.slug, agent.display_name); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-muted-foreground">{truncateText(agent.core_personality, 96)}</p>
                        <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                          <div className="min-w-0">
                            <div className="sm:hidden">Talkativeness {agent.talkativeness.toFixed(2)}</div>
                            <div className="sm:hidden">Provider {(agent.provider_type || "openai").toUpperCase()}</div>
                            <div className="truncate">Model {agent.model_id || "Default"}</div>
                          </div>
                          <div className="hidden text-right sm:block">
                            <div className="truncate">Model {agent.model_id || "Default"}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-border/60 bg-background/30 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-semibold">Scenario template</h3>
                <Button variant="ghost" size="icon" onClick={openEditTeamScenario}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                {detail.scenarioTemplate || "No default scenario saved yet."}
              </p>
            </div>
          </section>

          <section className="rounded-[22px] border border-border/60 bg-background/30 p-5">
            <h3 className="font-display text-xl font-semibold">Conversation history</h3>
            <div className="mt-4 space-y-3">
              {detail.conversations.filter((conversation) => conversation.status !== "template").map((conversation) => (
                <Link key={conversation.id} to={`/teams/${detail.team.id}/conversations/${conversation.id}`} className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/40 px-4 py-3 hover:border-primary/40">
                  <div>
                    <div className="font-medium">{conversation.title}</div>
                    <div className="text-xs text-muted-foreground">{conversation.status}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(conversation.updated_at).toLocaleString()}</span>
                </Link>
              ))}
              {detail.conversations.filter((conversation) => conversation.status !== "template").length === 0 && (
                <p className="text-sm text-muted-foreground">No saved conversations yet.</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
