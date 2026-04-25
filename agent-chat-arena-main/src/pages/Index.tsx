import { useState } from "react";
import { useSimulation } from "@/hooks/useSimulation";
import { ChatHeader } from "@/components/ChatHeader";
import { ScenarioSheetButton } from "@/components/ScenarioSheetButton";
import { ChatStream } from "@/components/ChatStream";
import { UnderTheHoodPanel } from "@/components/UnderTheHoodPanel";

const Index = () => {
  const sim = useSimulation();
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden">
      <ChatHeader
        title="Symposium"
        hasStarted={sim.hasStarted}
        isThinking={sim.isThinking}
        status={sim.status}
        autoPlay={sim.autoPlay}
        setAutoPlay={sim.setAutoPlay}
        onStart={sim.start}
        onAdvance={sim.advance}
        onReset={sim.reset}
        totalTurns={sim.totalTurns}
        completedTurns={sim.completedTurns}
        panelOpen={panelOpen}
        togglePanel={() => setPanelOpen((v) => !v)}
        config={sim.config}
      />
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="mx-auto mt-4 flex w-full max-w-3xl justify-end px-4 sm:px-6">
            <ScenarioSheetButton scenario={sim.config?.kickoff} />
          </div>
          <ChatStream
            messages={sim.messages}
            isThinking={sim.isThinking}
            hasStarted={sim.hasStarted}
            config={sim.config}
          />
        </main>
        {panelOpen && (
          <div className="hidden lg:block w-[360px] xl:w-[400px] shrink-0">
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
  );
};

export default Index;
