import { Stat } from "@/components/ui/Stat";
import { compact, num, pct, signedUsd, usd } from "@/lib/format";
import type { Ledger } from "@/lib/overview";
import type { AccountSnapshot } from "@/lib/agent/account";

const NEUTRAL_BAND = 0.005;

/** A value that renders as $0.00 should not be painted green or red. */
function signTone(value: number | null): "ink" | "positive" | "negative" {
  if (value === null || Math.abs(value) < NEUTRAL_BAND) return "ink";
  return value > 0 ? "positive" : "negative";
}

export function MetricStrip({
  ledger,
  account,
  mode,
}: {
  ledger: Ledger;
  account: AccountSnapshot | null;
  mode: string;
}) {
  const pnlTone = signTone(account === null ? null : account.totalPnl);
  const idleTokens = ledger.allowanceTokens;
  const unused = ledger.remainingTokens;

  return (
    <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Stat
        label="Tradable allowance"
        value={compact(idleTokens)}
        sub={`budget ${compact(ledger.budgetTokens)} − reserved ${compact(ledger.reservedTokens)}${ledger.carryInTokens > 0 ? ` + carried ${compact(ledger.carryInTokens)}` : ""}`}
      />
      <Stat
        label="Spent"
        value={compact(ledger.usedTokens)}
        sub={`${ledger.cyclesToday} cycles today · ${ledger.byModel.length} model${ledger.byModel.length === 1 ? "" : "s"}`}
      />
      <Stat
        label="Allowance utilisation"
        value={pct(ledger.utilization, 1)}
        sub={`${compact(unused)} tok left · ~${compact(ledger.averageCycleTokens)} per cycle`}
        tone={ledger.utilization > 0.9 ? "negative" : "accent"}
      />
      <Stat
        label="Equity"
        value={account ? usd(account.equity) : "—"}
        sub={`${mode} · collateral ${account ? usd(account.collateral) : "—"}`}
      />
      <Stat
        label="Total P&L"
        value={account ? signedUsd(account.totalPnl) : "—"}
        sub={account ? `unrealised ${signedUsd(account.unrealizedPnl)}` : "account state unavailable"}
        tone={pnlTone}
      />
      <Stat
        label="P&L per 1M tokens"
        value={ledger.pnlPerMillionTokens === null ? "—" : signedUsd(ledger.pnlPerMillionTokens)}
        sub={
          ledger.averageCycleCostUsd > 0
            ? `${num(ledger.averageCycleCostUsd, 4)} USD per decision`
            : "no decision cost recorded yet"
        }
        tone={signTone(ledger.pnlPerMillionTokens)}
      />
    </div>
  );
}
