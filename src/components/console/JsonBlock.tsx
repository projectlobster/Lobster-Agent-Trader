"use client";

import { cn } from "@/lib/cn";

export function JsonBlock({
  value,
  className,
  maxHeight = 320,
}: {
  value: unknown;
  className?: string;
  maxHeight?: number;
}) {
  return (
    <pre
      className={cn(
        "overflow-auto border border-line bg-canvas p-3 font-mono text-[11px] leading-4 text-ink-muted",
        className,
      )}
      style={{ maxHeight }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
