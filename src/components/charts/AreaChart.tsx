import { cn } from "@/lib/cn";

export type AreaPoint = { label: string; value: number };

const VIEW_WIDTH = 1000;

export function AreaChart({
  points,
  height = 220,
  baseline,
  className,
  emptyLabel = "Not enough data yet",
}: {
  points: AreaPoint[];
  height?: number;
  baseline?: number | null;
  className?: string;
  emptyLabel?: string;
}) {
  if (points.length < 2) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border border-line bg-surface",
          className,
        )}
        style={{ height }}
      >
        <span className="font-mono text-label-sm uppercase text-ink-muted">{emptyLabel}</span>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values, baseline ?? Number.POSITIVE_INFINITY);
  const rawMax = Math.max(...values, baseline ?? Number.NEGATIVE_INFINITY);
  const span = rawMax - rawMin;
  const pad = span === 0 ? Math.max(Math.abs(rawMax) * 0.01, 1) : span * 0.12;
  const min = rawMin - pad;
  const max = rawMax + pad;

  const x = (index: number) => (index / (points.length - 1)) * VIEW_WIDTH;
  const y = (value: number) => height - ((value - min) / (max - min)) * height;

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`)
    .join(" ");
  const area = `${line} L${VIEW_WIDTH},${height} L0,${height} Z`;
  const zeroY = baseline !== undefined && baseline !== null ? y(baseline) : null;

  return (
    <div className={cn("relative overflow-hidden border border-line bg-surface", className)}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label="Equity over time"
      >
        <path d={area} className="fill-accent/20" />
        <path
          d={line}
          fill="none"
          className="stroke-ink"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {zeroY !== null && zeroY >= 0 && zeroY <= height ? (
          <line
            x1={0}
            x2={VIEW_WIDTH}
            y1={zeroY}
            y2={zeroY}
            className="stroke-ink-muted"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2">
        <span className="tabular self-end font-mono text-mono-xs text-ink-muted">
          {max.toFixed(2)}
        </span>
        <span className="tabular self-end font-mono text-mono-xs text-ink-muted">
          {min.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
