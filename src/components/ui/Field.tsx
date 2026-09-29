import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-button border border-line-control bg-canvas px-3 py-2 font-mono text-body-sm text-ink outline-none transition-colors focus:border-ink disabled:opacity-50";

function Shell({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="font-mono text-label-sm uppercase tracking-[0.02em] text-ink-muted">
        {label}
      </span>
      {children}
      {hint ? <span className="text-body-xs text-ink-subtle">{hint}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <Shell label={label} hint={hint} className={className}>
      <input className={control} {...props} />
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Shell label={label} hint={hint} className={className}>
      <select className={cn(control, "appearance-none")} {...props}>
        {children}
      </select>
    </Shell>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-label-sm uppercase tracking-[0.02em] text-ink-muted">
          {label}
        </span>
        {hint ? <span className="text-body-xs text-ink-subtle">{hint}</span> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-button border transition-colors disabled:opacity-40",
          checked ? "border-transparent bg-tint-cyan" : "border-line-control bg-canvas",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4.5 transition-all",
            checked ? "left-[1.4rem] bg-tint-fg" : "left-0.5 bg-ink-muted",
          )}
        />
      </button>
    </div>
  );
}
