export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 26"
      aria-hidden="true"
      className={className ?? "h-[22px] w-auto overflow-visible"}
    >
      <path d="M12 0.8 L23 6.9 L12 13 L1 6.9 Z" className="fill-current" />
      <path d="M1 11.4 L12 17.5 L23 11.4 L23 14.6 L12 20.7 L1 14.6 Z" className="fill-tint-cyan" />
      <path d="M1 18 L12 24.1 L23 18 L23 19.6 L12 25.7 L1 19.6 Z" className="fill-current opacity-40" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={className ?? "flex items-center gap-2.5"}>
      <Wordmark />
      <span className="text-[19px] leading-none font-[550] tracking-[-0.018em]">
        Lobster Agent Trader
      </span>
    </span>
  );
}
