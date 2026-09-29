import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "./Label";

export function Card({
  label,
  title,
  children,
  footer,
  className,
  interactive = false,
}: {
  label?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative isolate flex flex-col overflow-hidden bg-surface",
        interactive && "transition-shadow hover:shadow-[0_18px_40px_-24px_rgb(18_16_28/0.35)]",
        className,
      )}
    >
      {interactive ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 origin-top scale-y-0 bg-tint-blue transition-transform duration-[240ms] ease-[steps(6,end)] group-hover:scale-y-100 motion-reduce:transition-none"
        />
      ) : null}
      <div className="flex flex-1 flex-col items-start p-5 md:p-6">
        {label ? (
          <Label className="transition-colors duration-[240ms] group-hover:text-tint-blue-fg">
            {label}
          </Label>
        ) : null}
        {title ? (
          <h3 className="mt-3.5 text-card-title text-ink transition-colors duration-[240ms] group-hover:text-tint-fg">
            {title}
          </h3>
        ) : null}
        {children}
      </div>
      {footer ? <div className="mt-auto w-full pt-0">{footer}</div> : null}
    </div>
  );
}
