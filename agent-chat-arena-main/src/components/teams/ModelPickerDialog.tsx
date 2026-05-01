import type { ManagedAgentDraft, ProviderCatalogEntry } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ModelPickerDialogProps = {
  open: boolean;
  agentIndex: number | null;
  agents: ManagedAgentDraft[];
  providerCatalog: Record<string, ProviderCatalogEntry>;
  onChoose: (modelId: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function ModelPickerDialog({ open, agentIndex, agents, providerCatalog, onChoose, onOpenChange }: ModelPickerDialogProps) {
  if (agentIndex === null) return null;
  const models = providerCatalog[agents[agentIndex].provider_type || "openai"]?.models || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-border/60 glass-strong">
        <DialogHeader>
          <DialogTitle>Choose model</DialogTitle>
          <DialogDescription>
            Select a model for this agent. Pricing is shown per 1M tokens.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {models.map((model) => (
            <button
              key={model.model_id}
              type="button"
              className={`rounded-2xl border p-4 text-left ${agents[agentIndex].model_id === model.model_id ? "border-primary/60 bg-primary/10" : "border-border/50 bg-card/40"}`}
              onClick={() => onChoose(model.model_id)}
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
  );
}
