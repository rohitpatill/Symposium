import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Brain, LoaderCircle, Plus, Trash2 } from "lucide-react";
import type { ManagedAgentDraft, ManagedGroupMemoryDraft, ProviderCatalogEntry, ProviderConfigSummary, TeamDetailResponse, TeamSummary } from "@/lib/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/teams/Field";
import { ModelPickerDialog } from "@/components/teams/ModelPickerDialog";
import { ProvidersDialog } from "@/components/teams/ProvidersDialog";
import { TeamDetailView } from "@/components/teams/TeamDetailView";
import { TeamsHomeView } from "@/components/teams/TeamsHomeView";
import { blankAgent, resolveManagedAssetUrl } from "@/components/teams/utils";

type BuilderChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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
  const [createMode, setCreateMode] = useState<"manual" | "ai" | null>(null);
  const [builderProviderConfigId, setBuilderProviderConfigId] = useState<number | null>(null);
  const [builderProviderType, setBuilderProviderType] = useState("openai");
  const [builderModelId, setBuilderModelId] = useState("");
  const [builderMessages, setBuilderMessages] = useState<BuilderChatMessage[]>([]);
  const [builderInput, setBuilderInput] = useState("");
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderReady, setBuilderReady] = useState(false);
  const [builderMissing, setBuilderMissing] = useState<string[]>([]);
  const [builderSummary, setBuilderSummary] = useState<Record<string, unknown> | null>(null);
  const [avatarUploadingIndex, setAvatarUploadingIndex] = useState<number | null>(null);

  const agentSlugs = useMemo(
    () => agents.map((agent) => agent.display_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")).filter(Boolean),
    [agents],
  );
  const validatedProviders = useMemo(() => providers.filter((provider) => provider.is_valid), [providers]);
  const hasValidatedProvider = validatedProviders.length > 0;
  const allAgentsHaveModelSetup = useMemo(
    () => agents.every((agent) => agent.provider_config_id && agent.model_id?.trim()),
    [agents],
  );
  const builderModelOptions = useMemo(
    () => providerCatalog[builderProviderType]?.models || [],
    [builderProviderType, providerCatalog],
  );
  const showCreateModeChoice = !editing && createMode === null;
  const usingAiBuilder = !editing && createMode === "ai";

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
      groupMemories: data.groupMemories,
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

  useEffect(() => {
    if (!builderProviderConfigId && validatedProviders.length > 0) {
      const firstProvider = validatedProviders[0];
      setBuilderProviderConfigId(firstProvider.id);
      setBuilderProviderType(firstProvider.provider_type);
      setBuilderModelId(providerCatalog[firstProvider.provider_type]?.models?.[0]?.model_id || "");
    }
  }, [builderProviderConfigId, providerCatalog, validatedProviders]);

  async function createTeam() {
    if (!hasValidatedProvider) {
      setConfirmState({
        title: "Validate a provider first",
        description: "Create at least one validated provider before creating a team.",
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

    setOpen(false);
    setEditing(false);
    setCreateStep(0);
    setActiveAgentIndex(0);
    await loadTeams();
    await loadProviders();
    if (editing && data.team) {
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

  async function createProviderConfig() {
    setProviderError(null);
    setProviderSuccess(null);
    setProviderValidating(true);
    const res = await fetch("/api/managed/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_type: providerType, api_key: providerApiKey }),
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

  async function uploadAgentAvatar(agentIndex: number, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    setAvatarUploadingIndex(agentIndex);
    try {
      const res = await fetch("/api/managed/uploads/agent-avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not upload avatar.");
      setAgents((prev) => prev.map((agent, idx) => idx === agentIndex ? { ...agent, avatar_url: data.avatar_url || "" } : agent));
    } catch (error) {
      setConfirmState({
        title: "Could not upload avatar",
        description: error instanceof Error ? error.message : "The selected image could not be uploaded.",
        actionLabel: "Close",
      });
      setConfirmOpen(true);
    } finally {
      setAvatarUploadingIndex(null);
    }
  }

  function resetBuilderState() {
    const firstProvider = validatedProviders[0];
    const nextType = firstProvider?.provider_type || "openai";
    setBuilderProviderConfigId(firstProvider?.id ?? null);
    setBuilderProviderType(nextType);
    setBuilderModelId(providerCatalog[nextType]?.models?.[0]?.model_id || "");
    setBuilderMessages([]);
    setBuilderInput("");
    setBuilderLoading(false);
    setBuilderReady(false);
    setBuilderMissing([]);
    setBuilderSummary(null);
  }

  async function runBuilderInterview(messages: BuilderChatMessage[]) {
    if (!builderProviderConfigId || !builderModelId) return;
    setBuilderLoading(true);
    const res = await fetch("/api/managed/team-builder/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_config_id: builderProviderConfigId,
        model_id: builderModelId,
        messages,
      }),
    });
    const data = await res.json();
    setBuilderLoading(false);
    if (!res.ok) {
      setConfirmState({
        title: "Symposium AI hit a wall",
        description: data.detail || "Symposium AI had trouble formatting its response. Please try again.",
        actionLabel: "Try again",
      });
      setConfirmOpen(true);
      return;
    }
    setBuilderMessages((prev) => [...prev, { role: "assistant", content: data.assistant_message }]);
    setBuilderReady(Boolean(data.ready_to_build));
    setBuilderMissing(Array.isArray(data.missing_information) ? data.missing_information : []);
    setBuilderSummary(data.captured_summary || null);
  }

  async function startBuilderInterview() {
    await runBuilderInterview([]);
  }

  async function sendBuilderMessage() {
    if (!builderInput.trim()) return;
    const nextMessages = [...builderMessages, { role: "user" as const, content: builderInput.trim() }];
    setBuilderMessages(nextMessages);
    setBuilderInput("");
    await runBuilderInterview(nextMessages);
  }

  async function buildTeamWithSymposiumAI() {
    if (!builderProviderConfigId || !builderModelId) return;
    setBuilderLoading(true);
    const res = await fetch("/api/managed/team-builder/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_config_id: builderProviderConfigId,
        model_id: builderModelId,
        messages: builderMessages,
      }),
    });
    const data = await res.json();
    setBuilderLoading(false);
    if (!res.ok) {
      setConfirmState({
        title: "Symposium AI hit a wall",
        description: data.detail || "Symposium AI could not convert the conversation into a valid team. Please try again.",
        actionLabel: "Try again",
      });
      setConfirmOpen(true);
      return;
    }
    setOpen(false);
    await loadTeams();
    navigate(`/teams/${data.team.team.id}`);
  }

  async function deleteProvider(provider: ProviderConfigSummary) {
    setConfirmState({
      title: "Delete provider?",
      description: `Remove ${provider.display_name}? Agents using it will need a new provider.`,
      actionLabel: "Delete",
      tone: "destructive",
      onConfirm: async () => {
        await fetch(`/api/managed/providers/${provider.id}`, { method: "DELETE" });
        await loadProviders();
      },
    });
    setConfirmOpen(true);
  }

  async function deleteTeam() {
    if (!detail) return;
    setConfirmState({
      title: "Delete team?",
      description: `Delete ${detail.team.name} and its saved conversations?`,
      actionLabel: "Delete",
      tone: "destructive",
      onConfirm: async () => {
        await fetch(`/api/managed/teams/${detail.team.id}`, { method: "DELETE" });
        navigate("/teams");
        await loadTeams();
      },
    });
    setConfirmOpen(true);
  }

  async function deleteAgent(slug: string, nameToDelete: string) {
    if (!detail) return;
    setConfirmState({
      title: "Delete agent?",
      description: `Remove ${nameToDelete} from this team?`,
      actionLabel: "Delete",
      tone: "destructive",
      onConfirm: async () => {
        await fetch(`/api/managed/teams/${detail.team.id}/agents/${slug}`, { method: "DELETE" });
        await loadDetail(String(detail.team.id));
      },
    });
    setConfirmOpen(true);
  }

  function hydrateTeamEditor(step = 0, agentIndex = 0) {
    if (!detail) return;
    setEditing(true);
    setCreateMode("manual");
    setCreateStep(step);
    setActiveAgentIndex(agentIndex);
    setName(detail.team.name);
    setDescription(detail.team.description || "");
    setScenarioTemplate(detail.scenarioTemplate || "");
    setGroupMemories(detail.groupMemories || []);
    setAgents(
      detail.agents.map((agent) => ({
        display_name: agent.display_name,
        avatar_url: agent.avatar_url || "",
        provider_config_id: agent.provider_config_id ?? null,
        provider_type: agent.provider_type || "openai",
        model_id: agent.model_id || "",
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
      })),
    );
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
        title: launchTitle,
        scenario_prompt: launchScenario,
        participant_slugs: launchParticipants,
        max_turns: maxTurns,
        all_hold_termination: allHoldTermination,
        consecutive_speaker_penalty: consecutivePenalty,
        penalty_multiplier_1: penalty1,
        penalty_multiplier_2: penalty2,
        penalty_multiplier_3: penalty3,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setConfirmState({ title: "Could not start conversation", description: data.detail || "Try again.", actionLabel: "Close" });
      setConfirmOpen(true);
      return;
    }
    setLaunchOpen(false);
    navigate(`/teams/${detail.team.id}/conversations/${data.conversationId}`);
  }

  function openCreateTeam() {
    if (!hasValidatedProvider) {
      setConfirmState({
        title: "Provider required",
        description: "You need at least one validated provider before creating a team.",
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
    setCreateMode(null);
    setCreateStep(0);
    setActiveAgentIndex(0);
    resetBuilderState();
    setOpen(true);
  }

  function addAgent() {
    setAgents((prev) => [...prev, blankAgent("")]);
  }

  function removeAgent(index: number) {
    setAgents((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
    setActiveAgentIndex((prev) => (prev >= index ? Math.max(0, prev - 1) : prev));
  }

  const providersHomeTrigger = (
    <ProvidersDialog
      open={providersOpen}
      onOpenChange={setProvidersOpen}
      providers={providers}
      providerCatalog={providerCatalog}
      providerType={providerType}
      providerApiKey={providerApiKey}
      providerError={providerError}
      providerSuccess={providerSuccess}
      providerValidating={providerValidating}
      hasValidatedProvider={hasValidatedProvider}
      setProviderType={setProviderType}
      setProviderApiKey={setProviderApiKey}
      setProviderError={setProviderError}
      setProviderSuccess={setProviderSuccess}
      createProviderConfig={createProviderConfig}
      deleteProvider={deleteProvider}
      trigger={<Button variant="secondary" className="rounded-xl">Setup providers</Button>}
    />
  );
  const providersDetailTrigger = (
    <ProvidersDialog
      open={providersOpen}
      onOpenChange={setProvidersOpen}
      providers={providers}
      providerCatalog={providerCatalog}
      providerType={providerType}
      providerApiKey={providerApiKey}
      providerError={providerError}
      providerSuccess={providerSuccess}
      providerValidating={providerValidating}
      hasValidatedProvider={hasValidatedProvider}
      setProviderType={setProviderType}
      setProviderApiKey={setProviderApiKey}
      setProviderError={setProviderError}
      setProviderSuccess={setProviderSuccess}
      createProviderConfig={createProviderConfig}
      deleteProvider={deleteProvider}
    />
  );

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
                if (confirmState?.onConfirm) await confirmState.onConfirm();
                setConfirmOpen(false);
              }}
            >
              {confirmState?.actionLabel || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-border/60 glass-strong">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit team" : usingAiBuilder ? "Create team with Symposium AI" : "Create team"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Build this step by step so the setup feels guided instead of overwhelming."
                : usingAiBuilder
                  ? "Let Symposium AI interview you, turn the conversation into a structured team, and build it for managed mode."
                  : createMode === "manual"
                    ? "Build this step by step so the setup feels guided instead of overwhelming."
                    : "Choose whether you want to build the team manually or with Symposium AI."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {!showCreateModeChoice && !usingAiBuilder && (
              <div className="flex gap-2">
                {["Team", "Names", "Agents", "Group", "Scenario"].map((label, index) => (
                  <div key={label} className={`rounded-full px-3 py-1 text-xs ${index === createStep ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"}`}>
                    {index + 1}. {label}
                  </div>
                ))}
              </div>
            )}

            {showCreateModeChoice && (
              <section className="grid gap-4 md:grid-cols-2 md:auto-rows-fr">
                <div className="rounded-2xl border border-border/60 bg-background/30 p-5 flex flex-col justify-between">
                  <div>
                    <div className="font-display text-xl font-semibold">Add manually</div>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">Walk through the full Symposium setup wizard yourself and control every field directly.</p>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <Button onClick={() => setCreateMode("manual")}>
                      Build manually
                    </Button>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/30 p-5 flex flex-col justify-between">
                  <div>
                    <div className="font-display text-xl font-semibold">Add using Symposium AI</div>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">Let the builder ask focused questions, shape the cast, and generate the managed payload for you.</p>
                    <div className="mt-5 space-y-4">
                      <Field label="Builder provider" hint="This is the provider Symposium AI uses while interviewing and generating the team.">
                        <select
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          value={String(builderProviderConfigId ?? "")}
                          onChange={(e) => {
                            const providerId = e.target.value ? Number(e.target.value) : null;
                            const provider = validatedProviders.find((item) => item.id === providerId);
                            setBuilderProviderConfigId(providerId);
                            setBuilderProviderType(provider?.provider_type || "openai");
                            setBuilderModelId(providerCatalog[provider?.provider_type || "openai"]?.models?.[0]?.model_id || "");
                          }}
                        >
                          {validatedProviders.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.display_name} ({provider.provider_type})
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Builder model" hint="Pick the model that should conduct the interview and generate the final team JSON.">
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={builderModelId} onChange={(e) => setBuilderModelId(e.target.value)}>
                          {builderModelOptions.map((model) => (
                            <option key={model.model_id} value={model.model_id}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <Button
                      onClick={async () => {
                        setCreateMode("ai");
                        setBuilderMessages([]);
                        setBuilderReady(false);
                        setBuilderMissing([]);
                        setBuilderSummary(null);
                        await startBuilderInterview();
                      }}
                      disabled={!builderProviderConfigId || !builderModelId}
                    >
                      Start with Symposium AI
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {usingAiBuilder && (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/30 px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    Builder using <span className="text-foreground">{builderProviderType}</span> / <span className="text-foreground">{builderModelId}</span>
                  </div>
                  <Button variant="secondary" onClick={() => setCreateMode(null)} disabled={builderLoading}>
                    Back
                  </Button>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/30 p-4 max-h-80 overflow-y-auto">
                  <div className="space-y-3">
                    {builderMessages.map((message, index) => (
                      <div
                        key={index}
                        className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                          message.role === "assistant" ? "border border-primary/20 bg-primary/10 text-foreground" : "border border-border/50 bg-card/40 text-foreground"
                        }`}
                      >
                        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{message.role === "assistant" ? "Symposium AI" : "You"}</div>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    ))}
                    {builderLoading && (
                      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Symposium AI is thinking...
                      </div>
                    )}
                  </div>
                  <div className="mt-4 space-y-3">
                    <Textarea
                      value={builderInput}
                      onChange={(e) => setBuilderInput(e.target.value)}
                      placeholder={
                        builderReady
                          ? "Symposium AI has enough information and is ready to build the team."
                          : "Describe the team, answer the current question, or add missing context."
                      }
                      className="min-h-28"
                      disabled={builderReady || builderLoading}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">
                        {builderReady
                          ? "Enough information has been collected. The next step is to build the team."
                          : builderMissing.length > 0
                            ? `Still missing: ${builderMissing.join(", ")}`
                            : "Answer naturally. Symposium AI will keep asking only what it still needs."}
                      </div>
                      {builderReady ? (
                        <Button onClick={() => void buildTeamWithSymposiumAI()} disabled={builderLoading || builderMessages.length === 0}>
                          Build team
                        </Button>
                      ) : (
                        <Button onClick={() => void sendBuilderMessage()} disabled={!builderInput.trim() || builderLoading}>
                          Send
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {!showCreateModeChoice && !usingAiBuilder && (
              <>
                {createStep === 0 && (
                  <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Team name" hint="This becomes the reusable managed team name.">
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency Ethics Council" />
                      </Field>
                      <Field label="Description" hint="Short note shown in the teams list.">
                        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A tense five-person council deciding who gets the only escape pod." />
                      </Field>
                    </div>
                  </section>
                )}

                {createStep === 1 && (
                  <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Agent list</div>
                        <p className="text-xs text-muted-foreground">Set the visible names first. We'll fill the deep prompt fields on the next step.</p>
                      </div>
                      <Button variant="secondary" onClick={addAgent}>
                        Add agent
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {agents.map((agent, index) => (
                        <div key={index} className="rounded-2xl border border-border/50 bg-card/40 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">Agent {index + 1}</div>
                            {agents.length > 2 && (
                              <Button variant="ghost" size="icon" onClick={() => removeAgent(index)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Input
                            className="mt-3"
                            value={agent.display_name}
                            onChange={(e) => updateAgent(setAgents, index, "display_name", e.target.value)}
                            placeholder="Ava"
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {createStep === 2 && agents[activeAgentIndex] && (
                  <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Configure agents</div>
                        <p className="text-xs text-muted-foreground">Fill one agent at a time instead of staring down everything at once.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {agents.map((agent, index) => (
                          <Button
                            key={index}
                            variant={index === activeAgentIndex ? "default" : "secondary"}
                            onClick={() => setActiveAgentIndex(index)}
                            disabled={!agent.display_name.trim()}
                          >
                            <span className="max-w-[140px] truncate">{agent.display_name || `Agent ${index + 1}`}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-5 rounded-2xl border border-border/50 bg-card/60 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Profile image" hint="Paste a public image URL or upload a local image from this laptop.">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="h-14 w-14 overflow-hidden rounded-full border border-border/60 bg-background/40">
                                {agents[activeAgentIndex].avatar_url ? (
                                  <img
                                    src={resolveManagedAssetUrl(agents[activeAgentIndex].avatar_url)}
                                    alt={agents[activeAgentIndex].display_name || "Agent avatar"}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                                    {(agents[activeAgentIndex].display_name || "AG").slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-2 text-sm">
                                  {avatarUploadingIndex === activeAgentIndex ? (
                                    <>
                                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    "Upload local image"
                                  )}
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    disabled={avatarUploadingIndex === activeAgentIndex}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) void uploadAgentAvatar(activeAgentIndex, file);
                                      e.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                                {agents[activeAgentIndex].avatar_url && (
                                  <Button type="button" variant="ghost" onClick={() => updateAgent(setAgents, activeAgentIndex, "avatar_url", "")}>
                                    Remove image
                                  </Button>
                                )}
                              </div>
                            </div>
                            <Input
                              value={agents[activeAgentIndex].avatar_url || ""}
                              onChange={(e) => updateAgent(setAgents, activeAgentIndex, "avatar_url", e.target.value)}
                              placeholder="https://example.com/avatar.png"
                            />
                          </div>
                        </Field>
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
                            {providers
                              .filter((provider) => provider.is_valid)
                              .map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                  {provider.display_name} ({provider.provider_type})
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Model" hint="Pick a model with visible input and output pricing.">
                          <Button type="button" variant="secondary" className="justify-start" onClick={() => setModelPickerAgentIndex(activeAgentIndex)}>
                            {agents[activeAgentIndex].model_id || "Choose model"}
                          </Button>
                        </Field>
                        <Field label="Talkativeness" hint="0.0 means quiet, 1.0 means nearly always trying to jump in.">
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={agents[activeAgentIndex].talkativeness}
                            onChange={(e) => updateAgent(setAgents, activeAgentIndex, "talkativeness", Number(e.target.value))}
                          />
                        </Field>
                        <Field label="Core personality" hint="How this person feels from the inside.">
                          <Textarea value={agents[activeAgentIndex].core_personality} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "core_personality", e.target.value)} />
                        </Field>
                        <Field label="Speech style" hint="How they sound when they actually speak out loud.">
                          <Textarea value={agents[activeAgentIndex].speech_style} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "speech_style", e.target.value)} />
                        </Field>
                        <Field label="Private goal" hint="What they want from the conversation, even if they hide it.">
                          <Textarea value={agents[activeAgentIndex].private_goal} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "private_goal", e.target.value)} />
                        </Field>
                        <Field label="What they value" hint="Priorities, loyalties, worldview.">
                          <Textarea value={agents[activeAgentIndex].values_text} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "values_text", e.target.value)} />
                        </Field>
                        <Field label="Handling defeat" hint="How they react when things go against them.">
                          <Textarea value={agents[activeAgentIndex].handling_defeat} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "handling_defeat", e.target.value)} />
                        </Field>
                        <Field label="Urgency tendency" hint="What makes them feel they absolutely must speak.">
                          <Textarea value={agents[activeAgentIndex].urgency_tendency} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "urgency_tendency", e.target.value)} />
                        </Field>
                        <Field label="Personal memory" hint="Private history or facts only this agent knows.">
                          <Textarea value={agents[activeAgentIndex].personal_memory} onChange={(e) => updateAgent(setAgents, activeAgentIndex, "personal_memory", e.target.value)} />
                        </Field>
                      </div>
                    </div>
                    <div className="mt-5 rounded-2xl border border-border/50 bg-card/60 p-4">
                      <div className="mb-4 text-sm font-medium">How this agent sees others</div>
                      <p className="mb-4 text-xs text-muted-foreground">Each agent has their own subjective view of every other agent. These views stay private and inform their decisions.</p>
                      <div className="grid gap-4 md:grid-cols-2">
                        {agents.map((otherAgent, otherIndex) => {
                          if (otherIndex === activeAgentIndex) return null;
                          const otherSlug = otherAgent.display_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
                          if (!otherSlug) return null;
                          return (
                            <Field key={otherSlug} label={`View of ${otherAgent.display_name || `Agent ${otherIndex + 1}`}`} hint="How this agent privately perceives the other.">
                              <Textarea
                                value={agents[activeAgentIndex].personas?.[otherSlug] || ""}
                                onChange={(e) => {
                                  const newPersonas = { ...agents[activeAgentIndex].personas };
                                  if (e.target.value.trim()) {
                                    newPersonas[otherSlug] = e.target.value;
                                  } else {
                                    delete newPersonas[otherSlug];
                                  }
                                  updateAgent(setAgents, activeAgentIndex, "personas", newPersonas);
                                }}
                                placeholder={`How ${agents[activeAgentIndex].display_name || "this agent"} privately sees ${otherAgent.display_name || "the other agent"}...`}
                              />
                            </Field>
                          );
                        })}
                      </div>
                    </div>
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
                        onClick={() =>
                          setGroupMemories((prev) => [...prev, { title: "", content: "", participant_slugs: [], is_general: prev.length === 0 }])
                        }
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
                                onChange={(e) => setGroupMemories((prev) => prev.map((item, i) => (i === memoryIndex ? { ...item, title: e.target.value } : item)))}
                                placeholder="Childhood alliance"
                              />
                            </Field>
                            <label className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 px-3 py-2">
                              <Checkbox
                                checked={memory.is_general}
                                onCheckedChange={(checked) =>
                                  setGroupMemories((prev) =>
                                    prev.map((item, i) =>
                                      i === memoryIndex
                                        ? { ...item, is_general: Boolean(checked), participant_slugs: Boolean(checked) ? [] : item.participant_slugs }
                                        : item,
                                    ),
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
                                onChange={(e) => setGroupMemories((prev) => prev.map((item, i) => (i === memoryIndex ? { ...item, content: e.target.value } : item)))}
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
                      <Textarea
                        value={scenarioTemplate}
                        onChange={(e) => setScenarioTemplate(e.target.value)}
                        placeholder="The station is failing. There is one pod left, and not enough seats for everyone."
                      />
                    </Field>
                  </section>
                )}

                <div className="flex justify-between">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (createStep === 0) {
                        setCreateMode(null);
                      } else {
                        setCreateStep((step) => Math.max(0, step - 1));
                      }
                    }}
                  >
                    Back
                  </Button>
                  {createStep < 4 ? (
                    <Button
                      onClick={() => {
                        if (createStep === 1) setActiveAgentIndex(0);
                        setCreateStep((step) => Math.min(4, step + 1));
                      }}
                      disabled={
                        (createStep === 0 && !name.trim()) ||
                        (createStep === 1 &&
                          (agents.length < 2 || new Set(agentSlugs).size !== agentSlugs.length || agents.some((agent) => !agent.display_name.trim()))) ||
                        (createStep === 2 && !allAgentsHaveModelSetup)
                      }
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      onClick={createTeam}
                      disabled={!name.trim() || agents.length < 2 || new Set(agentSlugs).size !== agentSlugs.length || !allAgentsHaveModelSetup}
                    >
                      {editing ? "Save team" : "Create team"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!detail ? (
        <TeamsHomeView teams={teams} onOpenCreateTeam={() => openCreateTeam()} providersTrigger={providersHomeTrigger} />
      ) : (
        <TeamDetailView
          detail={detail}
          providersTrigger={providersDetailTrigger}
          createTeamTrigger={<Button size="icon" className="rounded-xl" onClick={openCreateTeam}><Plus className="h-4 w-4" /></Button>}
          openEditTeam={openEditTeam}
          deleteTeam={deleteTeam}
          openEditTeamAgent={openEditTeamAgent}
          deleteAgent={deleteAgent}
          openEditTeamScenario={openEditTeamScenario}
          launchOpen={launchOpen}
          setLaunchOpen={setLaunchOpen}
          launchTitle={launchTitle}
          setLaunchTitle={setLaunchTitle}
          launchScenario={launchScenario}
          setLaunchScenario={setLaunchScenario}
          launchParticipants={launchParticipants}
          setLaunchParticipants={setLaunchParticipants}
          maxTurns={maxTurns}
          setMaxTurns={setMaxTurns}
          allHoldTermination={allHoldTermination}
          setAllHoldTermination={setAllHoldTermination}
          consecutivePenalty={consecutivePenalty}
          setConsecutivePenalty={setConsecutivePenalty}
          penalty1={penalty1}
          setPenalty1={setPenalty1}
          penalty2={penalty2}
          setPenalty2={setPenalty2}
          penalty3={penalty3}
          setPenalty3={setPenalty3}
          startConversation={startConversation}
          prepareLaunchDialog={() => {
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
        />
      )}

      <ModelPickerDialog
        open={modelPickerAgentIndex !== null}
        agentIndex={modelPickerAgentIndex}
        agents={agents}
        providerCatalog={providerCatalog}
        onChoose={(modelId) => {
          setAgents((prev) => prev.map((item, idx) => (idx === modelPickerAgentIndex ? { ...item, model_id: modelId } : item)));
          setModelPickerAgentIndex(null);
        }}
        onOpenChange={(value) => !value && setModelPickerAgentIndex(null)}
      />
    </div>
  );
}

function updateAgent(
  setAgents: React.Dispatch<React.SetStateAction<ManagedAgentDraft[]>>,
  index: number,
  key: keyof ManagedAgentDraft,
  value: string | number,
) {
  setAgents((prev) => prev.map((agent, i) => (i === index ? { ...agent, [key]: value } : agent)));
}
