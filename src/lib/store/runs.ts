import { randomUUID } from "node:crypto";
import { getAll, getOne, run } from "./db";

export type RunStatus = "ok" | "blocked" | "error" | "skipped";

export type RunRecord = {
  id: string;
  period_key: string;
  started_at: string;
  finished_at: string | null;
  mode: string;
  status: RunStatus;
  symbol: string | null;
  action: string | null;
  decision_json: string | null;
  snapshot_json: string | null;
  trace_json: string | null;
  order_json: string | null;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  latency_ms: number | null;
  pnl_after: number | null;
  error: string | null;
  stop_reason: string | null;
};

export function createRun(input: {
  periodKey: string;
  mode: string;
  status?: RunStatus;
  startedAt?: string;
}): string {
  const id = randomUUID();
  run(
    "INSERT INTO runs (id, period_key, started_at, mode, status) VALUES (?, ?, ?, ?, ?)",
    id,
    input.periodKey,
    input.startedAt ?? new Date().toISOString(),
    input.mode,
    input.status ?? "skipped",
  );
  return id;
}

export function finishRun(
  id: string,
  patch: {
    status: RunStatus;
    symbol?: string | null;
    action?: string | null;
    decision?: unknown;
    snapshot?: unknown;
    trace?: unknown;
    order?: unknown;
    tokensInput?: number;
    tokensOutput?: number;
    costUsd?: number;
    latencyMs?: number;
    pnlAfter?: number | null;
    error?: string | null;
    stopReason?: string | null;
  },
): void {
  run(
    `UPDATE runs SET
       finished_at = ?,
       status = ?,
       symbol = ?,
       action = ?,
       decision_json = ?,
       snapshot_json = ?,
       trace_json = ?,
       order_json = ?,
       tokens_input = ?,
       tokens_output = ?,
       cost_usd = ?,
       latency_ms = ?,
       pnl_after = ?,
       error = ?,
       stop_reason = ?
     WHERE id = ?`,
    new Date().toISOString(),
    patch.status,
    patch.symbol ?? null,
    patch.action ?? null,
    patch.decision === undefined ? null : JSON.stringify(patch.decision),
    patch.snapshot === undefined ? null : JSON.stringify(patch.snapshot),
    patch.trace === undefined ? null : JSON.stringify(patch.trace),
    patch.order === undefined ? null : JSON.stringify(patch.order),
    patch.tokensInput ?? 0,
    patch.tokensOutput ?? 0,
    patch.costUsd ?? 0,
    patch.latencyMs ?? null,
    patch.pnlAfter ?? null,
    patch.error ?? null,
    patch.stopReason ?? null,
    id,
  );
}

export function listRuns(args: { limit?: number; offset?: number; periodKey?: string } = {}) {
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 200);
  const offset = Math.max(args.offset ?? 0, 0);
  if (args.periodKey) {
    return getAll<RunRecord>(
      "SELECT * FROM runs WHERE period_key = ? ORDER BY started_at DESC LIMIT ? OFFSET ?",
      args.periodKey,
      limit,
      offset,
    );
  }
  return getAll<RunRecord>(
    "SELECT * FROM runs ORDER BY started_at DESC LIMIT ? OFFSET ?",
    limit,
    offset,
  );
}

export function getRun(id: string): RunRecord | undefined {
  return getOne<RunRecord>("SELECT * FROM runs WHERE id = ?", id);
}

export function countRuns(filter: { periodKey?: string; since?: string; mode?: string } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.periodKey) {
    clauses.push("period_key = ?");
    params.push(filter.periodKey);
  }
  if (filter.since) {
    clauses.push("started_at >= ?");
    params.push(filter.since);
  }
  if (filter.mode) {
    clauses.push("mode = ?");
    params.push(filter.mode);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const row = getOne<{ n: number }>(`SELECT COUNT(*) AS n FROM runs ${where}`, ...params);
  return row?.n ?? 0;
}

export function tokensUsedInPeriod(periodKey: string): number {
  const row = getOne<{ total: number | null }>(
    "SELECT SUM(tokens_input + tokens_output) AS total FROM runs WHERE period_key = ?",
    periodKey,
  );
  return row?.total ?? 0;
}

export function tokensByDay(periodKey: string, limit = 30) {
  return getAll<{ day: string; tokens: number; cost_usd: number; runs: number }>(
    `SELECT substr(started_at, 1, 10) AS day,
            SUM(tokens_input + tokens_output) AS tokens,
            SUM(cost_usd) AS cost_usd,
            COUNT(*) AS runs
     FROM runs
     WHERE period_key = ?
     GROUP BY day
     ORDER BY day DESC
     LIMIT ?`,
    periodKey,
    limit,
  );
}

export function tokensByModel(periodKey: string) {
  return getAll<{ model: string; provider: string; tokens: number; cost_usd: number; calls: number }>(
    `SELECT c.model AS model,
            c.provider AS provider,
            SUM(c.input_tokens + c.output_tokens) AS tokens,
            SUM(c.cost_usd) AS cost_usd,
            COUNT(*) AS calls
     FROM llm_calls c
     JOIN runs r ON r.id = c.run_id
     WHERE r.period_key = ?
     GROUP BY c.model, c.provider
     ORDER BY tokens DESC`,
    periodKey,
  );
}

export function statusBreakdown(periodKey: string) {
  return getAll<{ status: string; n: number }>(
    "SELECT status, COUNT(*) AS n FROM runs WHERE period_key = ? GROUP BY status",
    periodKey,
  );
}
