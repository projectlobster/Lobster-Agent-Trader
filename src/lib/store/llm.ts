import { getAll, getOne, run } from "./db";

export type LlmCallRecord = {
  id: number;
  run_id: string;
  attempt: number;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  created_at: string;
};

export function insertLlmCall(input: {
  runId: string;
  attempt?: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}): void {
  run(
    `INSERT INTO llm_calls (run_id, attempt, provider, model, input_tokens, output_tokens, cost_usd, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.runId,
    input.attempt ?? 1,
    input.provider,
    input.model,
    input.inputTokens,
    input.outputTokens,
    input.costUsd,
    input.latencyMs,
    new Date().toISOString(),
  );
}

export function listLlmCalls(runId: string): LlmCallRecord[] {
  return getAll<LlmCallRecord>(
    "SELECT * FROM llm_calls WHERE run_id = ? ORDER BY attempt ASC, id ASC",
    runId,
  );
}

export function averageCycleCost(): { costUsd: number; tokens: number; calls: number } {
  const row = getOne<{ cost: number | null; tokens: number | null; calls: number | null }>(
    `SELECT AVG(input_tokens + output_tokens) AS tokens,
            AVG(cost_usd) AS cost,
            COUNT(*) AS calls
     FROM llm_calls`,
  );
  return {
    costUsd: row?.cost ?? 0,
    tokens: row?.tokens ?? 0,
    calls: row?.calls ?? 0,
  };
}

/**
 * Average output tokens over the most recent calls. Used to size the per-cycle
 * budget reservation: reserving maxOutputTokens every time would over-state the
 * cost of a cycle and make the engine stop with allowance still unspent.
 */
export function recentOutputTokens(limit = 20): number | null {
  const row = getOne<{ avg: number | null; n: number }>(
    `SELECT AVG(output_tokens) AS avg, COUNT(*) AS n FROM (
       SELECT output_tokens FROM llm_calls ORDER BY id DESC LIMIT ?
     )`,
    limit,
  );
  if (!row || row.n < 3 || row.avg === null) return null;
  return row.avg;
}
