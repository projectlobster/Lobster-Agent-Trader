import { randomUUID } from "node:crypto";
import {
  acquireCycleLease,
  getEngineState,
  leaseHolder,
  releaseCycleLease,
  updateEngineState,
} from "@/lib/store/engine";
import type { TradingMode } from "@/lib/store/settings";
import { tick, type TickResult } from "./loop";

export const MIN_INTERVAL_SECONDS = 15;
/** Long enough for a slow cycle, short enough that a crash frees the lock. */
export const LEASE_TTL_SECONDS = 300;

const PROCESS_OWNER = `${process.pid}-${randomUUID().slice(0, 8)}`;

export type TickAttempt =
  | { kind: "ran"; result: TickResult }
  | { kind: "busy"; reason: string };

type EngineHandle = {
  timer: ReturnType<typeof setInterval> | null;
  ticking: boolean;
};

type GlobalWithEngine = typeof globalThis & { __lighterTraderEngine?: EngineHandle };

function handle(): EngineHandle {
  const g = globalThis as GlobalWithEngine;
  if (!g.__lighterTraderEngine) {
    g.__lighterTraderEngine = { timer: null, ticking: false };
  }
  return g.__lighterTraderEngine;
}

export function engineStatus() {
  const state = getEngineState();
  const h = handle();
  const lastTickMs = state.last_tick_at ? new Date(state.last_tick_at).getTime() : null;
  const staleAfterMs = Math.max(state.interval_seconds * 3, 90) * 1000;
  const stale =
    h.timer !== null && lastTickMs !== null && Date.now() - lastTickMs > staleAfterMs;

  return {
    running: h.timer !== null,
    ticking: h.ticking,
    /**
     * A timer that has not produced a tick in three intervals is almost always a
     * dead process (a restart, or a second Next worker that never got the timer).
     * The authoritative loop for unattended use is `npm run engine`.
     */
    stale,
    mode: state.mode as TradingMode,
    intervalSeconds: state.interval_seconds,
    startedAt: state.started_at,
    lastTickAt: state.last_tick_at,
    lastError: state.last_error,
    stopReason: state.stop_reason,
    lease: leaseHolder(),
    owner: PROCESS_OWNER,
  };
}

export function stopEngine(reason: string | null = null) {
  const h = handle();
  if (h.timer) {
    clearInterval(h.timer);
    h.timer = null;
  }

  // Never free the lease while a cycle is in flight. The tick's own `finally`
  // releases it; releasing here would hand the lock to another process (the
  // headless worker) mid-cycle and let two ticks place orders concurrently.
  if (!h.ticking) {
    releaseCycleLease(PROCESS_OWNER);
  }

  updateEngineState({ running: false, startedAt: null, stopReason: reason });
  return engineStatus();
}

async function guardedTick(trigger: "manual" | "engine"): Promise<TickAttempt> {
  const h = handle();
  if (h.ticking) {
    return { kind: "busy", reason: "a decision cycle is already running in this process" };
  }

  if (!acquireCycleLease(PROCESS_OWNER, LEASE_TTL_SECONDS)) {
    const holder = leaseHolder();
    return {
      kind: "busy",
      reason: `another process holds the cycle lease${
        holder.owner ? ` (${holder.owner})` : ""
      } — the headless worker and the web console share one lock`,
    };
  }

  h.ticking = true;
  try {
    return { kind: "ran", result: await tick({ trigger }) };
  } finally {
    h.ticking = false;
    releaseCycleLease(PROCESS_OWNER);
  }
}

function applyStops(result: TickResult): void {
  if (
    result.stopReason === "budget_exhausted" ||
    result.stopReason === "llm_not_configured" ||
    result.stopReason === "cycle_limit_reached"
  ) {
    // Nothing will change until the period or day resets, so keep ticking would
    // only burn wall-clock (and, for the first two, tokens).
    stopEngine(result.stopReason);
  } else if (result.blockedBy.includes("daily_loss_limit")) {
    stopEngine("daily_loss_limit");
  }
}

export async function runOnce(): Promise<TickAttempt> {
  const attempt = await guardedTick("engine");
  if (attempt.kind === "ran") applyStops(attempt.result);
  return attempt;
}

export function runManualTick(): Promise<TickAttempt> {
  return guardedTick("manual");
}

export function startEngine(intervalSeconds: number, mode: TradingMode) {
  const h = handle();
  if (h.timer) clearInterval(h.timer);

  const interval = Math.max(Math.round(intervalSeconds), MIN_INTERVAL_SECONDS);
  updateEngineState({
    running: true,
    mode,
    intervalSeconds: interval,
    startedAt: new Date().toISOString(),
    stopReason: null,
    lastError: null,
  });

  const timer = setInterval(() => {
    void runOnce();
  }, interval * 1000);
  timer.unref?.();
  h.timer = timer;

  void runOnce();

  return engineStatus();
}
