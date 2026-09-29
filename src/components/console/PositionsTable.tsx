import { num, signedUsd, usd } from "@/lib/format";
import type { PositionView } from "@/lib/agent/account";

export function PositionsTable({
  positions,
  mode,
}: {
  positions: PositionView[];
  mode: string;
}) {
  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-between border border-line bg-surface px-4 py-6">
        <p className="text-body text-ink-muted">No positions open</p>
        <p className="font-mono text-label-sm uppercase text-ink-subtle">{mode} account</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {["Symbol", "Side", "Size", "Entry", "Mark", "Notional", "Liq.", "uPnL"].map((head) => (
              <th
                key={head}
                className="px-4 py-2.5 font-mono text-label-sm uppercase text-ink-muted"
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={`${position.symbol}-${position.side}`} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-mono text-body-sm text-ink">{position.symbol}</td>
              <td className="px-4 py-3">
                <span
                  className={`font-mono text-label-sm uppercase ${
                    position.side === "long" ? "text-positive" : "text-negative"
                  }`}
                >
                  {position.side}
                </span>
              </td>
              <td className="tabular px-4 py-3 font-mono text-body-sm text-ink">
                {num(position.size, 5)}
              </td>
              <td className="tabular px-4 py-3 font-mono text-body-sm text-ink-muted">
                {num(position.avgEntryPrice, 2)}
              </td>
              <td className="tabular px-4 py-3 font-mono text-body-sm text-ink">
                {num(position.markPrice, 2)}
              </td>
              <td className="tabular px-4 py-3 font-mono text-body-sm text-ink-muted">
                {usd(position.notionalUsd)}
              </td>
              <td className="tabular px-4 py-3 font-mono text-body-sm text-ink-subtle">
                {position.liquidationPrice > 0 ? num(position.liquidationPrice, 2) : "—"}
              </td>
              <td
                className={`tabular px-4 py-3 font-mono text-body-sm ${
                  position.unrealizedPnl > 0
                    ? "text-positive"
                    : position.unrealizedPnl < 0
                      ? "text-negative"
                      : "text-ink-muted"
                }`}
              >
                {signedUsd(position.unrealizedPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
