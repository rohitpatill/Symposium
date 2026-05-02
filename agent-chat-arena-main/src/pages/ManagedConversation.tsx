import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ChatHeader } from "@/components/ChatHeader";
import { ScenarioSheetButton } from "@/components/ScenarioSheetButton";
import { ChatStream } from "@/components/ChatStream";
import { UnderTheHoodPanel } from "@/components/UnderTheHoodPanel";
import { useManagedConversation } from "@/hooks/useManagedConversation";

export default function ManagedConversationPage() {
  const { teamId, conversationId } = useParams();
  const sim = useManagedConversation(conversationId);
  const [panelOpen, setPanelOpen] = useState(true);

  if (sim.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading conversation…
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden">
      <div className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground glass-strong">
        <Link to={`/teams/${sim.conversation?.team_id}`} className="inline-flex items-center gap-2 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to team
        </Link>
      </div>
      <div className="h-[calc(100vh-41px)] flex flex-col overflow-hidden">
        <ChatHeader
          title="Symposium"
          hasStarted={sim.hasStarted}
          isThinking={sim.isThinking}
          status={sim.status}
          autoPlay={sim.autoPlay}
          setAutoPlay={sim.setAutoPlay}
          onStart={sim.start}
          onAdvance={sim.advance}
          onReset={sim.reload}
          totalTurns={sim.totalTurns}
          completedTurns={sim.turns.length}
          panelOpen={panelOpen}
          togglePanel={() => setPanelOpen((value) => !value)}
          config={sim.config}
        />
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            {sim.error && (
              <div className="mx-auto mt-4 w-full max-w-4xl rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {sim.error}
              </div>
            )}
            <div className="mx-auto mt-4 flex w-full max-w-4xl justify-end px-4 sm:px-6">
              <ScenarioSheetButton scenario={sim.conversation?.scenario_prompt || sim.config?.kickoff} />
            </div>
            <ChatStream
              messages={sim.messages}
              isThinking={sim.isThinking}
              hasStarted={sim.hasStarted}
              config={sim.config}
            />
          </main>
          {panelOpen && (
            <div className="hidden w-[480px] shrink-0 lg:block xl:w-[540px]">
              <UnderTheHoodPanel
                currentTurn={sim.currentTurn}
                isThinking={sim.isThinking}
                totalTurns={sim.totalTurns}
                config={sim.config}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
