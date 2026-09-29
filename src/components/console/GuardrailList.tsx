import type { Settings } from "@/lib/store/settings";
import { num, pct } from "@/lib/format";

export function GuardrailList({
  risk,
  mode,
  envLiveEnabled,
}: {
  risk: Settings["risk"];
  mode: string;
  envLiveEnabled: boolean;
}) {
  const rows: Array<{ label: string; value: string; note?: string }> = [
    {
      label: "Symbols the model may trade",
      value: risk.allowedSymbols.join(", ") || "none",
      note: "Anything else is rejected before an order is built.",
    },
    {
      label: "Max notional per order",
      value: `$${num(risk.maxNotionalUsd, 0)}`,
      note: "Larger requests are clamped, not rejected.",
    },
    {
      label: "Max account leverage",
      value: `${num(risk.maxLeverage, 0)}x`,
      note: "Also capped at 5x in the settings API.",
    },
    {
      label: "Max open positions",
      value: String(risk.maxOpenPositions),
    },
    {
      label: "Cycles per day",
      value: String(risk.maxCyclesPerDay),
    },
    {
      label: "Cooldown between orders",
      value: `${risk.cooldownSeconds}s`,
    },
    {
      label: "Minimum confidence",
      value: pct(risk.minConfidence, 0),
      note: "Lower-confidence decisions are discarded, so the model is told to answer `hold` instead.",
    },
    {
      label: "Daily loss limit",
      value: `$${num(risk.dailyLossLimitUsd, 0)}`,
      note: "Hitting it stops the engine, not just the next order.",
    },
    {
      label: "Execution mode",
      value: mode,
      note:
        mode === "live"
          ? envLiveEnabled
            ? "LIVE_ENABLE=1 and credentials verified before every order"
            : "blocked: LIGHTER_ENABLE_LIVE is not 1 in the server environment"
          : "paper account — no orders reach Lighter",
    },
  ];

  return (
    <dl className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-1.5 bg-surface p-4">
          <dt className="font-mono text-label-sm uppercase text-ink-muted">{row.label}</dt>
          <dd className="tabular font-mono text-body-sm text-ink">{row.value}</dd>
          {row.note ? <p className="text-body-xs text-ink-subtle">{row.note}</p> : null}
        </div>
      ))}
    </dl>
  );
}
