import { getAll, getOne, run } from "./db";

export type EquityRecord = {
  id: number;
  taken_at: string;
  mode: string;
  equity: number;
  collateral: number;
  unrealized_pnl: number;
  total_pnl: number;
  initial_collateral: number | null;
};

export function insertEquity(input: {
  mode: string;
  equity: number;
  collateral: number;
  unrealizedPnl: number;
  totalPnl: number;
  initialCollateral?: number | null;
}): void {
  run(
    `INSERT INTO equity (taken_at, mode, equity, collateral, unrealized_pnl, total_pnl, initial_collateral)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    new Date().toISOString(),
    input.mode,
    input.equity,
    input.collateral,
    input.unrealizedPnl,
    input.totalPnl,
    input.initialCollateral ?? null,
  );
}

/**
 * The most recent `limit` rows, returned oldest-first for charting.
 *
 * The inner query takes the newest rows and the outer one re-sorts them:
 * `ORDER BY taken_at ASC LIMIT n` on its own would keep the *oldest* n rows,
 * which silently pins the dashboard chart to stale data once the table grows
 * past the limit — the curve would look frozen while the account moves.
 */
export function listEquity(limit = 200, mode?: string) {
  const capped = Math.min(Math.max(limit, 1), 1000);
  const params: unknown[] = mode ? [mode, capped] : [capped];
  const where = mode ? "WHERE mode = ?" : "";
  return getAll<EquityRecord>(
    `SELECT * FROM (
       SELECT * FROM equity ${where} ORDER BY taken_at DESC LIMIT ?
     ) ORDER BY taken_at ASC`,
    ...params,
  );
}

export function startOfLocalDayISO(now = new Date()): string {
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function baselineEquityToday(mode?: string): EquityRecord | undefined {
  const since = startOfLocalDayISO();
  if (mode) {
    return getOne<EquityRecord>(
      "SELECT * FROM equity WHERE mode = ? AND taken_at < ? ORDER BY taken_at DESC LIMIT 1",
      mode,
      since,
    );
  }
  return getOne<EquityRecord>(
    "SELECT * FROM equity WHERE taken_at < ? ORDER BY taken_at DESC LIMIT 1",
    since,
  );
}
