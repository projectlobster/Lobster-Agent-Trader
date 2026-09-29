import type { RunRecord } from "@/lib/store/runs";
import { relativeTime } from "@/lib/format";

export function statusTone(status: string) {
  switch (status) {
    case "ok":
      return "text-positive";
    case "blocked":
      return "text-tint-yellow-strong";
    case "error":
      return "text-negative";
    default:
      return "text-ink-muted";
  }
}

export function RunsTable({
  runs,
  onSelect,
  selectedId,
}: {
  runs: RunRecord[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  if (runs.length === 0) {
    return (
      <div className="border border-line bg-surface px-4 py-6">
        <p className="text-body text-ink-muted">
          No decisions recorded yet. Press “Run once” on the Agent page, or start the engine so it
          ticks on its interval.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {["When", "Mode", "Status", "Action", "Symbol", "Tokens", "Cost", "Note"].map((head) => (
              <th key={head} className="px-4 py-2.5 font-mono text-label-sm uppercase text-ink-muted">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              onClick={onSelect ? () => onSelect(run.id) : undefined}
              className={`border-b border-line last:border-0 ${
                onSelect ? "cursor-pointer transition-colors hover:bg-tint-blue/40" : ""
              } ${selectedId === run.id ? "bg-tint-blue/50" : ""}`}
            >
              <td className="px-4 py-3 font-mono text-mono-xs whitespace-nowrap text-ink-muted">
                {relativeTime(run.started_at)}
              </td>
              <td className="px-4 py-3 font-mono text-label-sm uppercase text-ink-subtle">
                {run.mode}
              </td>
              <td className={`px-4 py-3 font-mono text-label-sm uppercase ${statusTone(run.status)}`}>
                {run.status}
              </td>
              <td className="px-4 py-3 font-mono text-body-sm text-ink">{run.action ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-body-sm text-ink">{run.symbol ?? "—"}</td>
              <td className="tabular px-4 py-3 font-mono text-mono-xs text-ink-muted">
                {run.tokens_input + run.tokens_output > 0
                  ? (run.tokens_input + run.tokens_output).toLocaleString("en-US")
                  : "—"}
              </td>
              <td className="tabular px-4 py-3 font-mono text-mono-xs text-ink-muted">
                {run.tokens_input + run.tokens_output > 0
                  ? `$${run.cost_usd.toFixed(4)}`
                  : "—"}
              </td>
              <td className="max-w-[320px] truncate px-4 py-3 text-body-xs text-ink-subtle">
                {run.stop_reason ?? run.error ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
