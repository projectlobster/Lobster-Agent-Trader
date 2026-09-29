import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/Label";

export function Section({
  label,
  title,
  description,
  actions,
  children,
  className,
}: {
  label?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          {label ? <Label>{label}</Label> : null}
          <h2 className="text-h2 text-ink">{title}</h2>
          {description ? (
            <p className="max-w-[42rem] text-body text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
