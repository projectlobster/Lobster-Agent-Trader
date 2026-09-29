import { getOne, run } from "./db";
import type { Settings } from "./settings";

export type Period = {
  period_key: string;
  budget_tokens: number;
  reserved_tokens: number;
  carry_in_tokens: number;
  created_at: string;
};

export function periodKeyFor(date: Date, resetDay: number): string {
  const day = Math.min(Math.max(Math.trunc(resetDay), 1), 28);
  const d = new Date(date.getTime());
  let year = d.getFullYear();
  let month = d.getMonth();
  if (d.getDate() < day) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function previousPeriodKey(periodKey: string): string {
  const [y, m] = periodKey.split("-").map((part) => Number(part));
  const month = m - 1;
  return month === 0
    ? `${y - 1}-12`
    : `${y}-${String(month).padStart(2, "0")}`;
}

export function getOrCreatePeriod(settings: Settings, now = new Date()): Period {
  const key = periodKeyFor(now, settings.budget.resetDay);
  const existing = getOne<Period>("SELECT * FROM periods WHERE period_key = ?", key);

  if (existing) {
    // Past periods stay frozen so their accounting and carry-over never shift,
    // but the live period must track Settings — otherwise editing the budget
    // would silently do nothing.
    if (
      existing.budget_tokens !== settings.budget.monthlyTokens ||
      existing.reserved_tokens !== settings.budget.reservedForWork
    ) {
      run(
        "UPDATE periods SET budget_tokens = ?, reserved_tokens = ? WHERE period_key = ?",
        settings.budget.monthlyTokens,
        settings.budget.reservedForWork,
        key,
      );
      return {
        ...existing,
        budget_tokens: settings.budget.monthlyTokens,
        reserved_tokens: settings.budget.reservedForWork,
      };
    }
    return existing;
  }

  let carryIn = 0;
  if (settings.budget.carryOverLeftover) {
    const prevKey = previousPeriodKey(key);
    const prev = getOne<Period>("SELECT * FROM periods WHERE period_key = ?", prevKey);
    if (prev) {
      const used = getOne<{ total: number | null }>(
        "SELECT SUM(tokens_input + tokens_output) AS total FROM runs WHERE period_key = ?",
        prevKey,
      );
      const allowance = Math.max(prev.budget_tokens - prev.reserved_tokens, 0);
      const leftover = allowance - (used?.total ?? 0);
      carryIn = Math.max(Math.round(leftover), 0);
    }
  }

  run(
    "INSERT INTO periods (period_key, budget_tokens, reserved_tokens, carry_in_tokens, created_at) VALUES (?, ?, ?, ?, ?)",
    key,
    settings.budget.monthlyTokens,
    settings.budget.reservedForWork,
    carryIn,
    now.toISOString(),
  );
  return {
    period_key: key,
    budget_tokens: settings.budget.monthlyTokens,
    reserved_tokens: settings.budget.reservedForWork,
    carry_in_tokens: carryIn,
    created_at: now.toISOString(),
  };
}

export function allowanceOf(period: Period): number {
  return Math.max(period.budget_tokens - period.reserved_tokens, 0) + period.carry_in_tokens;
}
