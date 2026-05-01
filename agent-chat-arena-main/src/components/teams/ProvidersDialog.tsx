import { LoaderCircle, Settings2, Trash2 } from "lucide-react";
import type { ProviderCatalogEntry, ProviderConfigSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "./Field";

type ProvidersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: ProviderConfigSummary[];
  providerCatalog: Record<string, ProviderCatalogEntry>;
  providerType: string;
  providerApiKey: string;
  providerError: string | null;
  providerSuccess: string | null;
  providerValidating: boolean;
  hasValidatedProvider: boolean;
  setProviderType: (value: string) => void;
  setProviderApiKey: (value: string) => void;
  setProviderError: (value: string | null) => void;
  setProviderSuccess: (value: string | null) => void;
  createProviderConfig: () => void | Promise<void>;
  deleteProvider: (provider: ProviderConfigSummary) => void | Promise<void>;
  trigger?: React.ReactNode;
};

export function ProvidersDialog(props: ProvidersDialogProps) {
  const {
    open,
    onOpenChange,
    providers,
    providerCatalog,
    providerType,
    providerApiKey,
    providerError,
    providerSuccess,
    providerValidating,
    hasValidatedProvider,
    setProviderType,
    setProviderApiKey,
    setProviderError,
    setProviderSuccess,
    createProviderConfig,
    deleteProvider,
    trigger,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="icon" variant="secondary" className="rounded-xl">
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
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
  );
}
