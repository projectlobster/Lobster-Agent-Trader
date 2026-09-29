import { getOne, run } from "./db";

export type EngineStateRecord = {
  id: number;
  running: number;
  mode: string;
  interval_seconds: number;
  started_at: string | null;
  last_tick_at: string | null;
  last_error: string | null;
  stop_reason: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
};

export function getEngineState(): EngineStateRecord {
  return (
    getOne<EngineStateRecord>("SELECT * FROM engine_state WHERE id = 1") ?? {
      id: 1,
      running: 0,
      mode: "paper",
      interval_seconds: 300,
      started_at: null,
      last_tick_at: null,
      last_error: null,
      stop_reason: null,
      lease_owner: null,
      lease_expires_at: null,
    }
  );
}

/**
 * Take the cross-process cycle lease. Contenders are the Next server (in-process
 * timer or the manual "run once" button) and the headless `npm run engine`
 * worker; without this, two of them could submit orders at the same time.
 * The claim is a single conditional UPDATE so it cannot interleave.
 */
export function acquireCycleLease(owner: string, ttlSeconds: number): boolean {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const { changes } = run(
    `UPDATE engine_state
        SET lease_owner = ?, lease_expires_at = ?
      WHERE id = 1
        AND (lease_owner IS NULL OR lease_owner = ? OR lease_expires_at IS NULL OR lease_expires_at < ?)`,
    owner,
    expires,
    owner,
    now.toISOString(),
  );
  return changes > 0;
}

export function releaseCycleLease(owner: string): void {
  run(
    "UPDATE engine_state SET lease_owner = NULL, lease_expires_at = NULL WHERE id = 1 AND lease_owner = ?",
    owner,
  );
}

export function leaseHolder(): { owner: string | null; expiresAt: string | null } {
  const state = getEngineState();
  const expired =
    state.lease_expires_at !== null && new Date(state.lease_expires_at) <= new Date();
  return expired
    ? { owner: null, expiresAt: null }
    : { owner: state.lease_owner, expiresAt: state.lease_expires_at };
}

export function updateEngineState(patch: {
  running?: boolean;
  mode?: string;
  intervalSeconds?: number;
  startedAt?: string | null;
  lastTickAt?: string | null;
  lastError?: string | null;
  stopReason?: string | null;
}): void {
  const current = getEngineState();
  const running = patch.running ?? current.running === 1;
  run(
    `UPDATE engine_state SET
       running = ?, mode = ?, interval_seconds = ?, started_at = ?, last_tick_at = ?, last_error = ?, stop_reason = ?
     WHERE id = 1`,
    running ? 1 : 0,
    patch.mode ?? current.mode,
    patch.intervalSeconds ?? current.interval_seconds,
    patch.startedAt === undefined ? current.started_at : patch.startedAt,
    patch.lastTickAt === undefined ? current.last_tick_at : patch.lastTickAt,
    patch.lastError === undefined ? current.last_error : patch.lastError,
    patch.stopReason === undefined ? current.stop_reason : patch.stopReason,
  );
}
