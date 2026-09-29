import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
  corners = false,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  corners?: boolean;
  hover?: boolean;
}) {
  return (
    <div className={cn("group relative overflow-hidden bg-panel text-panel-fg", className)}>
      {hover ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-1/3 h-1/3 bg-tint-cyan opacity-0 mix-blend-exclusion transition-opacity group-hover:animate-sweep group-hover:opacity-100 motion-reduce:hidden"
        />
      ) : null}
      {children}
      {corners ? (
        <>
          <span aria-hidden className="absolute top-0 left-0 size-3 bg-tint-cyan" />
          <span aria-hidden className="absolute top-0 right-0 size-3 bg-tint-cyan" />
          <span aria-hidden className="absolute bottom-0 left-0 size-3 bg-tint-cyan" />
          <span aria-hidden className="absolute right-0 bottom-0 size-3 bg-tint-cyan" />
        </>
      ) : null}
    </div>
  );
}
