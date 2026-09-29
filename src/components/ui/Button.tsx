import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "tint";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-canvas hover:bg-tint-cyan hover:text-tint-fg",
  secondary:
    "bg-surface text-ink border border-line-control hover:bg-tint-blue hover:text-tint-blue-fg hover:border-transparent",
  ghost: "text-ink hover:bg-surface",
  danger: "bg-negative text-white hover:opacity-90",
  tint: "bg-tint-cyan text-tint-fg hover:bg-surface hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-body-xs",
  md: "px-5 py-2.5 text-body",
  lg: "px-6 py-[13px] text-body",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-button font-medium tracking-[0.01em] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <a className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </a>
  );
}
