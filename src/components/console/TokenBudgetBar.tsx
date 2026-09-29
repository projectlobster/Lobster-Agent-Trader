import { compact, pct } from "@/lib/format";
import type { Ledger } from "@/lib/overview";

export function TokenBudgetBar({ ledger }: { ledger: Ledger }) {
  const segments = [
    { key: "used", label: "Spent by the trader", value: ledger.usedTokens, className: "bg-ink" },
    { key: "left", label: "Still untouched", value: ledger.remainingTokens, className: "bg-tint-cyan" },
    {
      key: "reserved",
      label: "Reserved for real work",
      value: ledger.reservedTokens,
      className: "bg-line",
    },
  ];
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 w-full overflow-hidden border border-line">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`${segment.className} h-full`}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.label}: ${compact(segment.value)}`}
          />
        ))}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center gap-2">
            <span aria-hidden className={`size-2.5 ${segment.className}`} />
            <dt className="font-mono text-label-sm uppercase text-ink-muted">{segment.label}</dt>
            <dd className="tabular font-mono text-mono-xs text-ink">
              {compact(segment.value)}{" "}
              <span className="text-ink-subtle">{pct(segment.value / total, 1)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-body-xs text-ink-subtle">
        Period <span className="font-mono">{ledger.periodKey}</span> (resets on day{" "}
        {ledger.resetDay} of each month)
        {ledger.carryOver
          ? " · unused allowance carries into the next period"
          : " · unused allowance does not carry over"}
      </p>
    </div>
  );
}
