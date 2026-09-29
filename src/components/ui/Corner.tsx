import { cn } from "@/lib/cn";

export function Corner({ className }: { className?: string }) {
  const base = "pointer-events-none absolute size-2.5";
  return (
    <>
      <span aria-hidden className={cn(base, "top-0 left-0 bg-tint-cyan", className)} />
      <span aria-hidden className={cn(base, "top-0 right-0 bg-tint-cyan", className)} />
      <span aria-hidden className={cn(base, "bottom-0 left-0 bg-tint-cyan", className)} />
      <span aria-hidden className={cn(base, "bottom-0 right-0 bg-tint-cyan", className)} />
    </>
  );
}
