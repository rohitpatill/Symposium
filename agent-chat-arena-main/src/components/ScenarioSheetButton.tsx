import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Props {
  scenario?: string;
}

export function ScenarioSheetButton({ scenario }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" disabled={!scenario?.trim()}>
          <FileText className="mr-2 h-4 w-4" />
          View scenario
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto border-border/60 glass-strong sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Scenario</SheetTitle>
          <SheetDescription>
            The kickoff context for this conversation. Hidden by default so long setups do not disrupt the chat layout.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
          {scenario || "No scenario available."}
        </div>
      </SheetContent>
    </Sheet>
  );
}
