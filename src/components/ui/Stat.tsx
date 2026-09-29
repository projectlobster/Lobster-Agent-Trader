import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Stat({
  label,
  value,
  sub,
  tone = "ink",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "ink" | "positive" | "negative" | "accent";
  className?: string;
}) {
  const tones = {
    ink: "text-ink",
    positive: "text-positive",
    negative: "text-negative",
    accent: "text-accent",
  } as const;

  return (
    <div className={cn("flex flex-col gap-2 bg-surface p-4 md:p-5", className)}>
      <p className="font-mono text-label-sm uppercase tracking-[0.02em] text-ink-muted">{label}</p>
      <p className={cn("tabular text-[1.375rem] leading-tight font-medium", tones[tone])}>
        {value}
      </p>
      {sub ? <p className="tabular font-mono text-mono-xs text-ink-subtle">{sub}</p> : null}
    </div>
  );
}
