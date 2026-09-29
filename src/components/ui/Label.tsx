import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type LabelProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  tone?: "muted" | "accent" | "panel" | "panel-muted";
};

const tones: Record<NonNullable<LabelProps["tone"]>, string> = {
  muted: "text-ink-muted",
  accent: "text-accent",
  panel: "text-panel-fg",
  "panel-muted": "text-panel-fg-muted",
};

export function Label({ children, className, as, tone = "muted" }: LabelProps) {
  const Tag = as ?? "p";
  return (
    <Tag
      className={cn(
        "font-mono text-label-sm uppercase tracking-[0.02em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
