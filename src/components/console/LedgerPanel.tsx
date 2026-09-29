import { BarSeries } from "@/components/charts/BarSeries";
import { Label } from "@/components/ui/Label";
import { compact, num, pct, usd } from "@/lib/format";
import type { Ledger } from "@/lib/overview";

export function LedgerPanel({ ledger }: { ledger: Ledger }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3 border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <Label>Token spend · by day</Label>
          <span className="tabular font-mono text-mono-xs text-ink-subtle">
            {compact(ledger.usedTokens)} tok
          </span>
        </div>
        <BarSeries
          height={120}
          bars={ledger.byDay.map((day) => ({
            label: day.day,
            value: day.tokens,
            hint: `${day.day} · ${compact(day.tokens)} tok · ${day.runs} runs`,
          }))}
          formatValue={(value) => `${compact(value)} tok`}
        />
        <div className="flex justify-between font-mono text-mono-xs text-ink-subtle">
          <span>{ledger.byDay[0]?.day ?? "—"}</span>
          <span>{ledger.byDay[ledger.byDay.length - 1]?.day ?? "—"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 border border-line bg-surface p-5">
        <Label>Token spend · by model</Label>
        {ledger.byModel.length === 0 ? (
          <p className="text-body-sm text-ink-muted">No calls recorded yet</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {["Model", "Calls", "Tokens", "Cost"].map((head) => (
                  <th key={head} className="py-2 font-mono text-label-sm uppercase text-ink-muted">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.byModel.map((row) => (
                <tr key={`${row.provider}-${row.model}`} className="border-b border-line last:border-0">
                  <td className="py-2.5 font-mono text-mono-xs text-ink">
                    {row.model}
                    <span className="ml-2 text-ink-subtle">{row.provider}</span>
                  </td>
                  <td className="tabular py-2.5 font-mono text-mono-xs text-ink-muted">{row.calls}</td>
                  <td className="tabular py-2.5 font-mono text-mono-xs text-ink-muted">
                    {compact(row.tokens)}
                  </td>
                  <td className="tabular py-2.5 font-mono text-mono-xs text-ink-muted">
                    {usd(row.cost_usd, 4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-col gap-3 border border-line bg-surface p-5 lg:col-span-2">
        <Label>Decision outcomes</Label>
        <div className="flex flex-wrap gap-6">
          {ledger.statuses.length === 0 ? (
            <p className="text-body-sm text-ink-muted">No decisions recorded yet</p>
          ) : (
            ledger.statuses.map((row) => (
              <div key={row.status} className="flex items-baseline gap-2">
                <span className="font-mono text-label-sm uppercase text-ink-muted">{row.status}</span>
                <span className="tabular font-mono text-body-sm text-ink">{row.n}</span>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-label-sm uppercase text-ink-muted">
              Average per cycle
            </span>
            <span className="tabular font-mono text-mono-xs text-ink">
              {compact(ledger.averageCycleTokens)} tok · {num(ledger.averageCycleCostUsd, 4)} USD
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-label-sm uppercase text-ink-muted">Utilisation</span>
            <span className="tabular font-mono text-mono-xs text-ink">
              {pct(ledger.utilization, 1)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
