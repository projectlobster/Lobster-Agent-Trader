import { RunsExplorer } from "@/components/console/RunsExplorer";
import { Section } from "@/components/console/Section";
import { allowanceOf, getOrCreatePeriod } from "@/lib/store/periods";
import { listRuns, tokensUsedInPeriod } from "@/lib/store/runs";
import { readSettings } from "@/lib/store/settings";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const settings = readSettings();
  const period = getOrCreatePeriod(settings);

  const initial = {
    runs: listRuns({ limit: 100 }),
    period: {
      periodKey: period.period_key,
      allowanceTokens: allowanceOf(period),
      usedTokens: tokensUsedInPeriod(period.period_key),
    },
  };

  return (
    <div className="flex flex-col gap-8 pt-8">
      <Section
        label="Runs"
        title="Every decision leaves a record"
        description="Including the decisions the guardrails stopped — those cost tokens too, and deserve to be seen. Open any row to inspect the market snapshot the model was given, its reply, and the full trace."
      >
        <RunsExplorer initial={initial} />
      </Section>
    </div>
  );
}
