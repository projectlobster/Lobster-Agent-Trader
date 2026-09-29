import { AgentControls } from "@/components/console/AgentControls";
import { GuardrailList } from "@/components/console/GuardrailList";
import { Section } from "@/components/console/Section";
import { engineStatus } from "@/lib/agent/engine";
import { readSettings, publicSettings } from "@/lib/store/settings";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const settings = readSettings();
  const engine = engineStatus();
  const view = publicSettings(settings);

  return (
    <div className="flex flex-col gap-10 pt-8">
      <Section
        label="Agent"
        title="Engine, mode and guardrails"
        description="Every interval the engine runs one decision cycle: pull a snapshot → ask the model for a structured decision → record the spend → clear the guardrails → execute. A failure at any step cannot let the loop run away."
      >
        <AgentControls
          initialEngine={engine}
          envLiveEnabled={process.env.LIGHTER_ENABLE_LIVE === "1"}
          liveEnabled={settings.liveEnabled}
          paperCollateral={settings.paper.initialCollateral}
          paperTier={settings.paper.tier}
          maxNotionalUsd={settings.risk.maxNotionalUsd}
        />
      </Section>

      <Section
        label="Guardrails"
        title="Every order clears this first"
        description="Guardrails run before an order is built. A decision they stop is archived as a blocked run rather than dropped silently."
      >
        <GuardrailList
          risk={view.risk}
          mode={engine.mode}
          envLiveEnabled={process.env.LIGHTER_ENABLE_LIVE === "1"}
        />
      </Section>
    </div>
  );
}
