import { cn } from "@/lib/cn";

export function BarSeries({
  bars,
  height = 120,
  formatValue,
  className,
}: {
  bars: Array<{ label: string; value: number; hint?: string }>;
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  if (bars.length === 0) {
    return (
      <p className="font-mono text-label-sm uppercase text-ink-muted">No usage recorded yet</p>
    );
  }

  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className={cn("flex items-end gap-1", className)} style={{ height }}>
      {bars.map((bar) => (
        <div
          key={bar.label}
          className="group relative flex h-full flex-1 flex-col justify-end"
          title={`${bar.label}: ${formatValue ? formatValue(bar.value) : bar.value}`}
        >
          <div
            className="w-full bg-tint-blue transition-colors group-hover:bg-tint-cyan"
            style={{ height: `${Math.max((bar.value / max) * 100, 2)}%` }}
          />
          {bar.hint ? (
            <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-mono-xs whitespace-nowrap text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
              {bar.hint}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
