import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Brain, FolderKanban, LoaderCircle, Pencil, Plus, Settings2, Trash2, Users } from "lucide-react";
import type { ManagedAgentDraft, ManagedGroupMemoryDraft, ProviderCatalogEntry, ProviderConfigSummary, TeamDetailResponse, TeamSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function blankAgent(name = ""): ManagedAgentDraft {
  return {
    display_name: name,
    provider_config_id: null,
    provider_type: "openai",
    model_id: "",
    role: "",
    core_personality: "",
    talkativeness: 0.5,
    speech_style: "",
    private_goal: "",
    values_text: "",
    handling_defeat: "",
    urgency_tendency: "",
    extra_notes: "",
    personal_memory: "",
    memories: [],
    personas: {},
  };
}

export default function TeamsPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [detail, setDetail] = useState<TeamDetailResponse | null>(null);
  const [providers, setProviders] = useState<ProviderConfigSummary[]>([]);
  const [providerCatalog, setProviderCatalog] = useState<Record<string, ProviderCatalogEntry>>({});
  const [open, setOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    actionLabel?: string;
    onConfirm?: () => Promise<void> | void;
    tone?: "default" | "destructive";
  } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scenarioTemplate, setScenarioTemplate] = useState("");
  const [agents, setAgents] = useState<ManagedAgentDraft[]>([blankAgent(""), blankAgent("")]);
  const [groupMemories, setGroupMemories] = useState<ManagedGroupMemoryDraft[]>([]);
  const [createStep, setCreateStep] = useState(0);
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchTitle, setLaunchTitle] = useState("");
  const [launchScenario, setLaunchScenario] = useState("");
  const [launchParticipants, setLaunchParticipants] = useState<string[]>([]);
  const [maxTurns, setMaxTurns] = useState(20);
  const [allHoldTermination, setAllHoldTermination] = useState(2);
  const [consecutivePenalty, setConsecutivePenalty] = useState(true);
  const [penalty1, setPenalty1] = useState(0.85);
  const [penalty2, setPenalty2] = useState(0.65);
  const [penalty3, setPenalty3] = useState(0.4);
  const [providerType, setProviderType] = useState("openai");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerSuccess, setProviderSuccess] = useState<string | null>(null);
  const [providerValidating, setProviderValidating] = useState(false);
  const [modelPickerAgentIndex, setModelPickerAgentIndex] = useState<number | null>(null);

  async function loadTeams() {
    const res = await fetch("/api/managed/teams");
    const data = await res.json();
    setTeams(data.teams);
  }

  async function loadProviders() {
    const res = await fetch("/api/managed/providers");
    const data = await res.json();
    setProviders(data.providers);
    setProviderCatalog(data.catalog);
  }

  async function loadDetail(id: string) {
    const res = await fetch(`/api/managed/teams/${id}`);
    const data = await res.json();
    setDetail({
      team: data.team,
      agents: data.agents,
      conversations: data.conversations,
      scenarioTemplate: data.scenarioTemplate,
    });
  }

  useEffect(() => {
    void loadTeams();
    void loadProviders();
  }, []);

  useEffect(() => {
    if (teamId) {
      void loadDetail(teamId);
    } else {
      setDetail(null);
    }
  }, [teamId]);

  const agentSlugs = useMemo(
    () => agents.map((agent) => agent.display_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")).filter(Boolean),
    [agents],
  );
  const validatedProviders = useMemo(() => providers.filter((provider) => provider.is_valid), [providers]);
  const hasValidatedProvider = validatedProviders.length > 0;
  const allAgentsHaveModelSetup = useMemo(
    () => agents.every((agent) => agent.provider_config_id && agent.model_id.trim()),
    [agents],
  );

  async function createTeam() {
    if (!hasValidatedProvider) {
      setConfirmState({
        title: "Validate a provider first",
        description: "Create at least one validated provider before creating a team. Open the provider setup and validate OpenAI or Gemini first.",
        actionLabel: "Open provider setup",
        onConfirm: () => setProvidersOpen(true),
      });
      setConfirmOpen(true);
      return;
    }
    const method = editing && detail ? "PUT" : "POST";
    const url = editing && detail ? `/api/managed/teams/${detail.team.id}` : "/api/managed/teams";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        agents,
      group_memories: groupMemories,
      scenario_template: scenarioTemplate,
    }),
    });
    const data = await res.json();
    if (!res.ok) {
      setConfirmState({
        title: editing ? "Could not save team" : "Could not create team",
        description: data.detail || "The team could not be saved.",
        actionLabel: "Close",
      });
      setConfirmOpen(true);
      return;
    }
    if (data.status === "ok") {
      setOpen(false);
      setEditing(false);
      setCreateStep(0);
      setActiveAgentIndex(0);
      await loadTeams();
      await loadProviders();
      if (editing && detail && data.team) {
        setDetail({
          team: data.team.team,
          agents: data.team.agents,
          conversations: data.team.conversations,
          scenarioTemplate: data.team.scenarioTemplate,
          groupMemories: data.team.groupMemories || [],
        });
      }
      navigate(`/teams/${data.team.team.id}`);
    }
  }

  async function createProviderConfig() {
    setProviderError(null);
    setProviderSuccess(null);
    setProviderValidating(true);
    const res = await fetch("/api/managed/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_type: providerType,
        api_key: providerApiKey,
      }),
    });
    const data = await res.json();
    setProviderValidating(false);
    if (!res.ok) {
      setProviderError(data.detail || "Could not save provider.");
      return;
    }
    setProviderApiKey("");
    setProviderSuccess(data.message || "Provider validated successfully.");
    await loadProviders();
  }

  async function deleteProvider(provider: ProviderConfigSummary) {
    setConfirmState({
      title: `Delete ${provider.display_name}?`,
      description: "This removes the saved key from managed mode. Agents using it will fall back to the app default until you choose another provider.",
      actionLabel: "Delete provider",
      tone: "destructive",
      onConfirm: async () => {
        const res = await fetch(`/api/managed/providers/${provider.id}`, { method: "DELETE" });
        if (res.ok) {
          await loadProviders();
          if (detail?.team?.id) {
            await loadDetail(String(detail.team.id));
          }
        }
      },
    });
    setConfirmOpen(true);
  }

  async function deleteTeam() {
    if (!detail) return;
    setConfirmState({
      title: `Delete ${detail.team.name}?`,
      description: "All agents and all conversations under this team will be permanently deleted.",
      actionLabel: "Delete team",
      tone: "destructive",
      onConfirm: async () => {
        const res = await fetch(`/api/managed/teams/${detail.team.id}`, { method: "DELETE" });
        if (res.ok) {
          await loadTeams();
          navigate("/teams");
        }
      },
    });
    setConfirmOpen(true);
  }

  async function deleteAgent(slug: string, nameToDelete: string) {
    if (!detail) return;
    setConfirmState({
      title: `Delete ${nameToDelete}?`,
      description: "This removes them from other agents' personas and memories, and deletes all conversations involving this agent.",
      actionLabel: "Delete agent",
      tone: "destructive",
      onConfirm: async () => {
        const res = await fetch(`/api/managed/teams/${detail.team.id}/agents/${slug}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) {
          setConfirmState({
            title: "Could not delete agent",
            description: data.detail || "The agent could not be deleted.",
            actionLabel: "Close",
          });
          setConfirmOpen(true);
          return;
        }
        await loadDetail(String(detail.team.id));
        await loadTeams();
      },
    });
    setConfirmOpen(true);
  }

  function hydrateTeamEditor(step = 0, agentIndex = 0) {
    if (!detail) return;
    setEditing(true);
    setName(detail.team.name);
    setDescription(detail.team.description || "");
    setScenarioTemplate(detail.scenarioTemplate || "");
    setAgents(detail.agents.map((agent) => ({
      ...blankAgent(agent.display_name),
      display_name: agent.display_name,
      provider_config_id: agent.provider_config_id ?? null,
      provider_type: agent.provider_type ?? "openai",
      model_id: agent.model_id ?? "",
      role: agent.role || "",
      core_personality: agent.core_personality || "",
      talkativeness: agent.talkativeness ?? 0.5,
      speech_style: agent.speech_style || "",
      private_goal: agent.private_goal || "",
      values_text: agent.values_text || "",
      handling_defeat: agent.handling_defeat || "",
      urgency_tendency: agent.urgency_tendency || "",
      extra_notes: agent.extra_notes || "",
      personal_memory: agent.personal_memory || "",
      memories: agent.memories || [],
      personas: agent.personas || {},
    })));
    setGroupMemories(detail.groupMemories || []);
    setCreateStep(step);
    setActiveAgentIndex(agentIndex);
    setOpen(true);
  }

  function openEditTeam() {
    hydrateTeamEditor(0, 0);
  }

  function openEditTeamAgent(agentIndex: number) {
    hydrateTeamEditor(2, agentIndex);
  }

  function openEditTeamScenario() {
    hydrateTeamEditor(4, 0);
  }

  async function startConversation() {
    if (!detail) return;
    const res = await fetch(`/api/managed/teams/${detail.team.id}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: launchTitle || `${detail.team.name} Run ${detail.conversations.length + 1}`,
        participant_slugs: launchParticipants,
        scenario_prompt: launchScenario || detail.scenarioTemplate || "A fresh conversation is about to begin.",
        max_turns: maxTurns,
        all_hold_termination: allHoldTermination,
        consecutive_speaker_penalty: consecutivePenalty,
        penalty_multiplier_1: penalty1,
        penalty_multiplier_2: penalty2,
        penalty_multiplier_3: penalty3,
      }),
    });
    const data = await res.json();
    if (data.status === "ok") {
      setLaunchOpen(false);
      navigate(`/conversations/${data.conversationId}`);
    }
  }

  function openCreateTeam() {
    if (!hasValidatedProvider) {
      setConfirmState({
        title: "Provider required",
        description: "You need at least one validated provider before creating a team. Validate a provider first, then come back to build the team.",
        actionLabel: "Open provider setup",
        onConfirm: () => setProvidersOpen(true),
      });
      setConfirmOpen(true);
      return;
    }
    setEditing(false);
    setName("");
    setDescription("");
    setScenarioTemplate("");
    setAgents([blankAgent(""), blankAgent("")]);
    setGroupMemories([]);
    setCreateStep(0);
    setActiveAgentIndex(0);
    setOpen(true);
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="border-border/60 glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {confirmState?.onConfirm && <AlertDialogCancel>Cancel</AlertDialogCancel>}
            <AlertDialogAction
              className={confirmState?.tone === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={async (event) => {
                event.preventDefault();
                if (confirmState?.onConfirm) {
                  await confirmState.onConfirm();
                }
                setConfirmOpen(false);
              }}
            >
              {confirmState?.actionLabel || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[24px] border border-border/60 glass-strong p-5">
          <div className="flex items-center justify-between">
            <div>
              <Link to="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" />
                Home
              </Link>
              <h1 className="mt-3 font-display text-2xl font-semibold">Teams</h1>
            </div>
            <div className="flex gap-2">
              <Dialog open={providersOpen} onOpenChange={setProvidersOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="secondary" className="rounded-xl">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-border/60 glass-strong">
                  <DialogHeader>
                    <DialogTitle>LLM Providers</DialogTitle>
                    <DialogDescription>
                      Configure provider keys once, validate them, then use them across agents. Each agent can choose its own provider and model.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Provider" hint="One saved key per provider. Re-validating updates the existing one.">
                        <select
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          value={providerType}
                          onChange={(e) => {
                            setProviderType(e.target.value);
                            setProviderError(null);
                            setProviderSuccess(null);
                          }}
                        >
                          {Object.values(providerCatalog).map((provider) => (
                            <option key={provider.id} value={provider.id}>{provider.name}</option>
                          ))}
                        </select>
                      </Field>
                      <div className="rounded-2xl border border-border/50 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
                        We keep this simple: each provider gets one managed key. Update the key here any time and every future agent selection will use the refreshed version.
                      </div>
                    </div>
                    <Field label="API key" hint="Saved and validated before it becomes selectable.">
                      <Input value={providerApiKey} onChange={(e) => setProviderApiKey(e.target.value)} placeholder="Paste provider API key" />
                    </Field>
                    {providerValidating && (
                      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Validating your key...
                      </div>
                    )}
                    {providerSuccess && (
                      <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                        {providerSuccess}
                      </div>
                    )}
                    {providerError && (
                      <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {providerError}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button onClick={createProviderConfig} disabled={!providerApiKey.trim() || providerValidating}>
                        {providerValidating ? "Validating..." : "Validate and save"}
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {providers.map((provider) => (
                        <div key={provider.id} className="rounded-2xl border border-border/50 bg-card/40 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{provider.display_name}</div>
                              <div className="text-xs text-muted-foreground">{provider.provider_type}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`text-xs ${provider.is_valid ? "text-primary" : "text-destructive"}`}>
                                {provider.is_valid ? "Validated" : provider.validation_error || "Invalid"}
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => void deleteProvider(provider)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {providers.length === 0 && <p className="text-sm text-muted-foreground">No provider keys configured yet.</p>}
                      {providers.length > 0 && !hasValidatedProvider && (
                        <p className="text-sm text-destructive">You have provider entries, but none are validated yet. Validate one before creating a team.</p>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="icon"
                    className="rounded-xl"
                    onClick={(event) => {
                      event.preventDefault();
                      openCreateTeam();
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-border/60 glass-strong">
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit team" : "Create team"}</DialogTitle>
                  <DialogDescription>
                    Build this step by step so the setup feels guided instead of overwhelming.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="flex gap-2">
                    {["Team", "Names", "Agents", "Group", "Scenario"].map((label, index) => (
                      <div key={label} className={`rounded-full px-3 py-1 text-xs ${index === createStep ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"}`}>
                        {index + 1}. {label}
                      </div>
                    ))}
                  </div>

                  {createStep === 0 && (
                    <section className="grid gap-4 sm:grid-cols-2">
                      <Field label="Team name" hint="Reusable identity for this agent set.">
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Helios pod survivors" />
                      </Field>
                      <Field label="Description" hint="Optional note to help future browsing.">
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Five people, one escape pod, no calm adults in sight." />
                      </Field>
                    </section>
                  )}

                  {createStep === 1 && (
                    <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="font-display text-lg font-semibold">Agent names</h2>
                          <p className="text-sm text-muted-foreground">Start with names only. Minimum 2, maximum 11.</p>
                        </div>
                        <Button variant="secondary" onClick={() => setAgents((prev) => [...prev, blankAgent("")])} disabled={agents.length >= 11}>
                          Add agent
                        </Button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {agents.map((agent, index) => (
                          <div key={index} className="rounded-xl border border-border/50 bg-card/40 p-3">
                            <Field label={`Agent ${index + 1}`} hint="Names must be unique inside this team.">
                              <Input value={agent.display_name} onChange={(e) => updateAgent(setAgents, index, "display_name", e.target.value)} placeholder={`Agent ${index + 1} name`} />
                            </Field>
                            <div className="mt-3 flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (agents.length <= 2) {
                                    setConfirmState({
                                      title: "Minimum team size reached",
                                      description: "At least two agents are required. Add another agent before deleting this one.",
                                      actionLabel: "Close",
                                    });
                                    setConfirmOpen(true);
                                    return;
                                  }
                                  setAgents((prev) => prev.filter((_, i) => i !== index));
                                  setActiveAgentIndex((current) => Math.max(0, Math.min(current, agents.length - 2)));
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {createStep === 2 && (
                    <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="font-display text-lg font-semibold">Configure agents</h2>
                          <p className="text-sm text-muted-foreground">Fill one agent at a time instead of staring down everything at once.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {agents.map((agent, index) => (
                            <Button key={index} variant={index === activeAgentIndex ? "default" : "secondary"} onClick={() => setActiveAgentIndex(index)} disabled={!agent.display_name.trim()}>
                              <span className="max-w-[140px] truncate">{agent.display_name || `Agent ${index + 1}`}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                      {agents[activeAgentIndex] && (
                        <div className="mt-5 rounded-2xl border border-border/50 bg-card/60 p-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Role" hint="Short outward role, like Chief Medic or Security Lead.">
                              <Input value={agents[activeAgentIndex].role} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "role", e.target.value)} placeholder="Civilian Scientist" />
                            </Field>
                            <Field label="Provider" hint="Which configured provider this agent should use.">
                              <select
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                value={String(agents[activeAgentIndex].provider_config_id ?? "")}
                                onChange={(e) => {
                                  const providerId = e.target.value ? Number(e.target.value) : null;
                                  const provider = providers.find((item) => item.id === providerId);
                                  setAgents((prev) =>
                                    prev.map((item, idx) =>
                                      idx === activeAgentIndex
                                        ? {
                                            ...item,
                                            provider_config_id: providerId,
                                            provider_type: provider?.provider_type || "openai",
                                            model_id: "",
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                              >
                                <option value="">Choose provider</option>
                                {providers.filter((provider) => provider.is_valid).map((provider) => (
                                  <option key={provider.id} value={provider.id}>
                                    {provider.display_name} ({provider.provider_type})
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Model" hint="Pick a model with visible input and output pricing.">
                              <Button
                                type="button"
                                variant="secondary"
                                className="justify-start"
                                onClick={() => setModelPickerAgentIndex(activeAgentIndex)}
                              >
                                {agents[activeAgentIndex].model_id || "Choose model"}
                              </Button>
                            </Field>
                            <Field label="Talkativeness" hint="0.0 means quiet, 1.0 means nearly always trying to jump in.">
                              <Input type="number" min={0} max={1} step={0.01} value={agents[activeAgentIndex].talkativeness} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "talkativeness", Number(e.target.value))} />
                            </Field>
                            <Field label="Core personality" hint="How this person feels from the inside.">
                              <Textarea value={agents[activeAgentIndex].core_personality} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "core_personality", e.target.value)} placeholder="Hysterical, entitled, brilliant, and deeply unfit for survival situations." />
                            </Field>
                            <Field label="Speech style" hint="How they sound when they actually speak out loud.">
                              <Textarea value={agents[activeAgentIndex].speech_style} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "speech_style", e.target.value)} placeholder="Fast, repetitive, high-strung. Uses phrases like 'you don't understand'." />
                            </Field>
                            <Field label="Private goal" hint="What they want from the conversation, even if they hide it.">
                              <Textarea value={agents[activeAgentIndex].private_goal} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "private_goal", e.target.value)} placeholder="Get onto the pod at all costs and leverage the cure if necessary." />
                            </Field>
                            <Field label="What they value" hint="Priorities, loyalties, worldview.">
                              <Textarea value={agents[activeAgentIndex].values_text} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "values_text", e.target.value)} placeholder="Their life, their work, and getting home with proof they mattered." />
                            </Field>
                            <Field label="Handling defeat" hint="How they react when things go against them.">
                              <Textarea value={agents[activeAgentIndex].handling_defeat} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "handling_defeat", e.target.value)} placeholder="Melts down, threatens escalation, and blames everyone else." />
                            </Field>
                            <Field label="Urgency tendency" hint="What makes them feel they absolutely must speak.">
                              <Textarea value={agents[activeAgentIndex].urgency_tendency} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "urgency_tendency", e.target.value)} placeholder="Speaks instantly when survival math is challenged, otherwise waits for emotional noise to settle." />
                            </Field>
                            <Field label="Personal memory" hint="Private history or facts only this agent knows.">
                              <Textarea value={agents[activeAgentIndex].personal_memory} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "personal_memory", e.target.value)} placeholder="I have the only copy of the cure and I know Rook is capable of violence." />
                            </Field>
                          </div>
                          {agents.filter((_, otherIndex) => otherIndex !== activeAgentIndex && agents[otherIndex].display_name.trim()).length > 0 && (
                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                              {agents
                                .map((otherAgent, otherIndex) => ({ otherAgent, otherIndex }))
                                .filter(({ otherIndex, otherAgent }) => otherIndex !== activeAgentIndex && otherAgent.display_name.trim())
                                .map(({ otherAgent }) => {
                                  const otherSlug = otherAgent.display_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
                                  return (
                                    <Field key={`${activeAgentIndex}-${otherSlug}`} label={`Persona about ${otherAgent.display_name}`} hint="How this agent privately sees that teammate.">
                                      <Textarea
                                        value={agents[activeAgentIndex].personas[otherSlug] || ""}
                                        onChange={(e) =>
                                          setAgents((prev) =>
                                            prev.map((item, currentIndex) =>
                                              currentIndex === activeAgentIndex
                                                ? { ...item, personas: { ...item.personas, [otherSlug]: e.target.value } }
                                                : item,
                                            ),
                                          )
                                        }
                                        placeholder="Reliable, frightening, sentimental, manipulative, secretly trusted..."
                                      />
                                    </Field>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {createStep === 3 && (
                    <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Brain className="h-4 w-4 text-primary" />
                          Add shared history that belongs to everyone or only to a specific subset.
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => setGroupMemories((prev) => [...prev, { title: "", content: "", participant_slugs: [], is_general: prev.length === 0 }])}
                        >
                          Add group memory
                        </Button>
                      </div>
                      <div className="mt-4 space-y-4">
                        {groupMemories.map((memory, memoryIndex) => (
                          <div key={memoryIndex} className="rounded-2xl border border-border/50 bg-card/50 p-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <Field label="Memory title" hint="Quick label for this memory cluster.">
                                <Input
                                  value={memory.title}
                                  onChange={(e) => setGroupMemories((prev) => prev.map((item, i) => i === memoryIndex ? { ...item, title: e.target.value } : item))}
                                  placeholder="Childhood alliance"
                                />
                              </Field>
                              <label className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 px-3 py-2">
                                <Checkbox
                                  checked={memory.is_general}
                                  onCheckedChange={(checked) =>
                                    setGroupMemories((prev) =>
                                      prev.map((item, i) => i === memoryIndex ? { ...item, is_general: Boolean(checked), participant_slugs: Boolean(checked) ? [] : item.participant_slugs } : item),
                                    )
                                  }
                                />
                                <span className="text-sm">Visible to all agents</span>
                              </label>
                            </div>
                            {!memory.is_general && (
                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                {agents.map((agent) => {
                                  const slug = agent.display_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
                                  if (!slug) return null;
                                  return (
                                    <label key={slug} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 px-3 py-2">
                                      <Checkbox
                                        checked={memory.participant_slugs.includes(slug)}
                                        onCheckedChange={(checked) =>
                                          setGroupMemories((prev) =>
                                            prev.map((item, i) =>
                                              i === memoryIndex
                                                ? {
                                                    ...item,
                                                    participant_slugs: checked
                                                      ? [...item.participant_slugs, slug]
                                                      : item.participant_slugs.filter((value) => value !== slug),
                                                  }
                                                : item,
                                            ),
                                          )
                                        }
                                      />
                                      <span className="text-sm">{agent.display_name || "Unnamed agent"}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            <div className="mt-4">
                              <Field label="Memory details" hint="What happened, who knows it, and why it changes the way they read each other now.">
                                <Textarea
                                  value={memory.content}
                                  onChange={(e) => setGroupMemories((prev) => prev.map((item, i) => i === memoryIndex ? { ...item, content: e.target.value } : item))}
                                  placeholder="These three covered for each other during the tribunal, so they trust each other's half-truths more than anyone else in the room."
                                />
                              </Field>
                            </div>
                          </div>
                        ))}
                        {groupMemories.length === 0 && <p className="text-sm text-muted-foreground">No group memories added yet.</p>}
                      </div>
                    </section>
                  )}

                  {createStep === 4 && (
                    <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <Field label="Default scenario template" hint="Used to prefill the kickoff when launching a new conversation.">
                        <Textarea value={scenarioTemplate} onChange={(e) => setScenarioTemplate(e.target.value)} placeholder="The station is failing. There is one pod left, and not enough seats for everyone." />
                      </Field>
                    </section>
                  )}

                  <div className="flex justify-between">
                    <Button variant="secondary" onClick={() => setCreateStep((step) => Math.max(0, step - 1))} disabled={createStep === 0}>
                      Back
                    </Button>
                    {createStep < 4 ? (
                      <Button
                        onClick={() => {
                          if (createStep === 1) {
                            setActiveAgentIndex(0);
                          }
                          setCreateStep((step) => Math.min(4, step + 1));
                        }}
                        disabled={
                          (createStep === 0 && !name.trim()) ||
                          (createStep === 1 && (agents.length < 2 || new Set(agentSlugs).size !== agentSlugs.length || agents.some((agent) => !agent.display_name.trim()))) ||
                          (createStep === 2 && !allAgentsHaveModelSetup)
                        }
                      >
                        Next
                      </Button>
                    ) : (
                      <Button onClick={createTeam} disabled={!name.trim() || agents.length < 2 || new Set(agentSlugs).size !== agentSlugs.length || !allAgentsHaveModelSetup}>
                        {editing ? "Save team" : "Create team"}
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
              </Dialog>
              {modelPickerAgentIndex !== null && (
                <Dialog open={modelPickerAgentIndex !== null} onOpenChange={(value) => !value && setModelPickerAgentIndex(null)}>
                  <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-border/60 glass-strong">
                    <DialogHeader>
                      <DialogTitle>Choose model</DialogTitle>
                      <DialogDescription>
                        Select a model for this agent. Pricing is shown per 1M tokens.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 md:grid-cols-2">
                      {(providerCatalog[agents[modelPickerAgentIndex].provider_type || "openai"]?.models || []).map((model) => (
                        <button
                          key={model.model_id}
                          type="button"
                          className={`rounded-2xl border p-4 text-left ${agents[modelPickerAgentIndex].model_id === model.model_id ? "border-primary/60 bg-primary/10" : "border-border/50 bg-card/40"}`}
                          onClick={() => {
                            setAgents((prev) =>
                              prev.map((item, idx) =>
                                idx === modelPickerAgentIndex ? { ...item, model_id: model.model_id } : item,
                              ),
                            );
                            setModelPickerAgentIndex(null);
                          }}
                        >
                          <div className="font-medium">{model.name}</div>
                          <div className="mt-2 text-xs text-muted-foreground">{model.model_id}</div>
                          <div className="mt-4 flex gap-6 text-sm">
                            <div>
                              <div className="text-xs text-muted-foreground">Input</div>
                              <div>${model.input.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Output</div>
                              <div>${model.output.toFixed(2)}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {teams.map((team) => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className={`block rounded-2xl border px-4 py-3 transition-colors ${String(team.id) === teamId ? "border-primary/60 bg-primary/10" : "border-border/40 bg-background/20 hover:border-border/70"}`}
              >
                <div className="font-medium">{team.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{team.description || "No description yet."}</div>
              </Link>
            ))}
          </div>
        </aside>

        <main className="rounded-[24px] border border-border/60 glass-strong p-5">
          {!detail ? (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-[20px] border border-dashed border-border/60 bg-background/20">
              <div className="max-w-md text-center">
                <FolderKanban className="mx-auto h-10 w-10 text-primary" />
                <h2 className="mt-4 font-display text-2xl font-semibold">Managed mode workspace</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Pick a team to review its agents and conversation history, or create a new one from scratch.
                </p>
              </div>
            </div>
          ) : (
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
                      <Button
                        onClick={() => {
                          setLaunchTitle(`${detail.team.name} Run ${detail.conversations.filter((conversation) => conversation.status !== "template").length + 1}`);
                          setLaunchScenario(detail.scenarioTemplate || "");
                          setLaunchParticipants(detail.agents.map((agent) => agent.slug));
                          setMaxTurns(20);
                          setAllHoldTermination(2);
                          setConsecutivePenalty(true);
                          setPenalty1(0.85);
                          setPenalty2(0.65);
                          setPenalty3(0.4);
                        }}
                      >
                        Start new conversation
                      </Button>
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
                                setLaunchParticipants((prev) =>
                                  checked ? [...prev, agent.slug] : prev.filter((slug) => slug !== agent.slug),
                                )
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
                                Models real-group social pressure: dominant speakers face increasing pressure to yield the floor. The penalty scales effective urgency only. The agent's self-reported urgency is never modified, and LLMs never see urgency at all.
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
                        <Button onClick={startConversation} disabled={launchParticipants.length < 2}>
                          Start
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                  </Dialog>
                </div>
              </div>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-[22px] border border-border/60 bg-background/30 p-5">
                  <h3 className="font-display text-xl font-semibold">Agents</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {detail.agents.map((agent, index) => (
                      <div key={agent.id} className="rounded-2xl border border-border/50 bg-card/50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">{agent.display_name}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-primary/80">{agent.role}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditTeamAgent(index)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => void deleteAgent(agent.slug, agent.display_name)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{agent.core_personality || "No personality summary yet."}</p>
                        <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                          <div>Talkativeness {agent.talkativeness.toFixed(2)}</div>
                          <div>Provider {(agent.provider_type || "openai").toUpperCase()}</div>
                          <div>Model {agent.model_id || "Default"}</div>
                        </div>
                      </div>
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
                    <Link key={conversation.id} to={`/conversations/${conversation.id}`} className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/40 px-4 py-3 hover:border-primary/40">
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
          )}
        </main>
      </div>
    </div>
  );
}

function updateAgent(
  setAgents: React.Dispatch<React.SetStateAction<ManagedAgentDraft[]>>,
  index: number,
  key: keyof ManagedAgentDraft,
  value: string | number,
) {
  setAgents((prev) => prev.map((agent, i) => i === index ? { ...agent, [key]: value } : agent));
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs leading-5 text-muted-foreground">{hint}</div>
      </div>
      {children}
    </label>
  );
}
