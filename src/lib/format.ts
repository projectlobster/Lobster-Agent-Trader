export function usd(value: number, digits = 2): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function signedUsd(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function num(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function int(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${num(value / 1_000_000, 1)}M`;
  if (Math.abs(value) >= 1_000) return `${num(value / 1_000, 1)}K`;
  return int(value);
}

export function pct(value: number, digits = 1): string {
  return `${num(value * 100, digits)}%`;
}

export function bps(value: number): string {
  return `${num(value, 2)} bps`;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-CA")} ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
