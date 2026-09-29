import { complete } from "@/lib/llm";
import { paperOrderIoc, paperOrderMarket, paperStatus } from "@/lib/kit/paper";
import { orderMarket } from "@/lib/kit/trade";
import { accountInfo, authStatus } from "@/lib/kit/query";
import { insertEquity, baselineEquityToday, startOfLocalDayISO } from "@/lib/store/equity";
import { insertLlmCall, recentOutputTokens } from "@/lib/store/llm";
import { insertOrder, lastOrderAt } from "@/lib/store/orders";
import { allowanceOf, getOrCreatePeriod } from "@/lib/store/periods";
import { countRuns, createRun, finishRun, tokensUsedInPeriod, type RunStatus } from "@/lib/store/runs";
import { getEngineState, updateEngineState } from "@/lib/store/engine";
import { readSettings, resolveApiKey, type Settings, type TradingMode } from "@/lib/store/settings";
import { evaluateDecision, type ExecutionPlan } from "./guardrails";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from "./prompt";
import { parseDecision, type Decision } from "./schema";
import { buildSnapshot } from "./snapshot";

export const MIN_CYCLE_TOKENS = 4_000;
const CHARS_PER_TOKEN = 4;
const MAX_REPAIR_ATTEMPTS = 2;

// Measured against a free OpenRouter reasoning model: with reasoning off a cycle
// averaged 3.1k tokens but produced a schema-invalid decision in 1 of 4 runs and
// drifted out of the requested language; with reasoning at "low" it averaged 5.8k
// tokens and was valid and correctly-localised 4 of 4. Reliability wins by default,
// and "off" stays available for anyone optimising purely for token spend.
export const ESTIMATED_OUTPUT_TOKENS = 1_200;

export type TraceStep = {
  step: string;
  at: string;
  ms?: number;
  detail?: unknown;
};

export type TickResult = {
  runId: string;
  status: RunStatus;
  mode: TradingMode;
  decision: Decision | null;
  order: unknown;
  error: string | null;
  stopReason: string | null;
  tokens: { input: number; output: number; costUsd: number };
  blockedBy: string[];
  messages: string[];
};

// CJK text runs close to one token per character, while latin text is nearer
// four characters per token. Treating the whole prompt as latin would understate
// a Chinese-heavy prompt and let the engine overshoot the allowance.
const CJK_PATTERN = /[\u3000-\u9fff\uff00-\uffef]/g;

function estimateTokens(text: string): number {
  const cjk = (text.match(CJK_PATTERN) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk + rest / CHARS_PER_TOKEN);
}

/** Include the provider's own diagnostic so a failed run explains itself. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const detail = (error as { detail?: unknown }).detail;
  return typeof detail === "string" && detail.length > 0 ? `${message} — ${detail}` : message;
}

function liveGate(settings: Settings): { ok: boolean; reason?: string } {
  if (!settings.liveEnabled) {
    return { ok: false, reason: "the live switch is off in Settings" };
  }
  if (process.env.LIGHTER_ENABLE_LIVE !== "1") {
    return {
      ok: false,
      reason: "LIGHTER_ENABLE_LIVE is not set to 1 in the server environment",
    };
  }
  return { ok: true };
}

async function executePlan(
  plan: ExecutionPlan,
  mode: TradingMode,
  settings: Settings,
): Promise<{
  raw: Record<string, unknown>;
  filledSize: number | null;
  avgPrice: number | null;
  fee: number | null;
  clientOrderIndex: string | null;
  /** Size the venue reported as unfilled, when it reports one. */
  unfilled: number | null;
}> {
  const kitOptions = { host: settings.kit.host || undefined };

  if (mode === "paper") {
    const callOptions = { ...kitOptions, statePath: settings.kit.paperStatePath || undefined };
    const result =
      plan.orderType === "ioc" && plan.limitPrice !== null
        ? await paperOrderIoc(
            { symbol: plan.symbol, side: plan.side, amount: plan.amount, price: plan.limitPrice },
            callOptions,
          )
        : await paperOrderMarket(
            { symbol: plan.symbol, side: plan.side, amount: plan.amount },
            callOptions,
          );
    const raw = result as unknown as Record<string, unknown>;
    return {
      raw,
      filledSize: typeof raw.filled_size === "number" ? raw.filled_size : null,
      avgPrice: typeof raw.avg_price === "number" ? raw.avg_price : null,
      fee: typeof raw.total_fee === "number" ? raw.total_fee : null,
      clientOrderIndex: null,
      unfilled: typeof raw.unfilled === "number" ? raw.unfilled : null,
    };
  }

  const result = await orderMarket(
    {
      symbol: plan.symbol,
      side: plan.side,
      amount: plan.amount,
      slippage: 0.005,
      reduceOnly: plan.reduceOnly,
    },
    kitOptions,
  );
  const raw = result as unknown as Record<string, unknown>;
  const effectiveAmount =
    typeof raw.effective_amount === "string" ? Number(raw.effective_amount) : null;
  const effectivePrice =
    typeof raw.effective_price === "string" ? Number(raw.effective_price) : null;
  return {
    raw,
    filledSize: effectiveAmount,
    avgPrice: effectivePrice,
    fee: null,
    clientOrderIndex:
      raw.client_order_index === undefined ? null : String(raw.client_order_index),
    // A live write is only "submitted"; the venue decides what filled.
    unfilled: null,
  };
}

async function takeEquitySnapshot(mode: TradingMode, settings: Settings): Promise<void> {
  try {
    if (mode === "paper") {
      // Refresh marks here too: this snapshot feeds both the equity curve and
      // the daily-loss baseline, and the loss limit is a safety mechanism that
      // must not be measured against stale prices.
      const status = await paperStatus(
        { refresh: true },
        { host: settings.kit.host || undefined, statePath: settings.kit.paperStatePath || undefined },
      );
      insertEquity({
        mode,
        equity: status.collateral + status.unrealized_pnl,
        collateral: status.collateral,
        unrealizedPnl: status.unrealized_pnl,
        totalPnl: status.total_pnl,
        initialCollateral: status.initial_collateral,
      });
      return;
    }

    const info = await accountInfo(undefined, { host: settings.kit.host || undefined });
    const record = info.accounts?.[0];
    if (!record) return;
    const unrealized = (record.positions ?? []).reduce(
      (sum, p) => sum + Number(p.unrealized_pnl ?? 0),
      0,
    );
    const collateral = Number(record.collateral ?? 0);
    insertEquity({
      mode,
      equity: collateral + unrealized,
      collateral,
      unrealizedPnl: unrealized,
      totalPnl: unrealized,
    });
  } catch {
    // Equity snapshots are best-effort telemetry; a failure must not fail the cycle.
  }
}

export async function tick(
  options: { trigger?: "manual" | "engine" } = {},
): Promise<TickResult> {
  const trigger = options.trigger ?? "manual";
  const settings = readSettings();
  const engine = getEngineState();
  const mode: TradingMode = engine.mode === "live" ? "live" : "paper";
  const period = getOrCreatePeriod(settings);
  const allowance = allowanceOf(period);
  const usedBefore = tokensUsedInPeriod(period.period_key);
  const remainingBefore = Math.max(allowance - usedBefore, 0);

  // Counted before this cycle's own row exists: createRun() inserts a row
  // immediately, and counting it would consume one slot of the daily budget and
  // make `maxCyclesPerDay: N` really mean N-1.
  const cyclesTodayBefore = countRuns({ since: startOfLocalDayISO(), mode });
  const engineName = mode === "paper" ? "paper" : "live";

  const runId = createRun({ periodKey: period.period_key, mode });
  const trace: TraceStep[] = [];
  const mark = (step: string, at: number, detail?: unknown) =>
    trace.push({ step, at: new Date().toISOString(), ms: Date.now() - at, detail });
  // Recorded up front: when reviewing a run it matters whether a human pressed
  // "Run once" or the interval timer fired.
  mark("cycle_start", Date.now(), { trigger });

  const base: TickResult = {
    runId,
    status: "skipped",
    mode,
    decision: null,
    order: null,
    error: null,
    stopReason: null,
    tokens: { input: 0, output: 0, costUsd: 0 },
    blockedBy: [],
    messages: [],
  };

  const skip = (stopReason: string, error?: string): TickResult => {
    finishRun(runId, { status: "skipped", trace, stopReason, error });
    updateEngineState({ lastTickAt: new Date().toISOString(), stopReason });
    return { ...base, stopReason, error: error ?? null };
  };

  try {
    if (remainingBefore < MIN_CYCLE_TOKENS) {
      return skip(
        "budget_exhausted",
        `only ${Math.round(remainingBefore)} tokens left in this period; a cycle needs about ${MIN_CYCLE_TOKENS}`,
      );
    }

    // Gate on the daily cycle budget *before* spending anything. Checking it
    // only in the risk layer meant that once the limit was reached, every
    // remaining interval still paid for a full LLM call just to be told no.
    if (cyclesTodayBefore >= settings.risk.maxCyclesPerDay) {
      return skip(
        "cycle_limit_reached",
        `${cyclesTodayBefore} cycles already run today (limit ${settings.risk.maxCyclesPerDay}); resuming after the daily reset`,
      );
    }

    const apiKey = resolveApiKey(settings);
    if (!apiKey) {
      const result = skip(
        "llm_not_configured",
        `no API key for ${settings.llm.provider}; add one in Settings or set it in .env.local`,
      );
      finishRun(runId, { status: "error", trace, error: result.error, stopReason: "llm_not_configured" });
      return { ...result, status: "error" };
    }

    const tSnapshot = Date.now();
    const snapshot = await buildSnapshot(settings, mode);
    mark("market_snapshot", tSnapshot, {
      symbols: snapshot.symbols.length,
      positions: snapshot.positions.length,
      warnings: snapshot.warnings,
    });

    if (snapshot.symbols.length === 0) {
      finishRun(runId, {
        status: "error",
        snapshot,
        trace,
        error: "no market data available for the watchlist",
      });
      updateEngineState({ lastTickAt: new Date().toISOString(), lastError: "no market data" });
      return { ...base, status: "error", error: "no market data available for the watchlist" };
    }

    const baseline = baselineEquityToday(mode);
    const dailyPnlChange = baseline && snapshot.account
      ? snapshot.account.totalPnl - baseline.total_pnl
      : 0;

    const system = buildSystemPrompt(settings, mode);
    const user = buildUserPrompt({
      snapshot,
      budget: {
        allowanceTokens: allowance,
        usedTokens: usedBefore,
        remainingTokens: remainingBefore,
        minCycleTokens: MIN_CYCLE_TOKENS,
      },
      cycleNumber: cyclesTodayBefore + 1,
      mode,
    });

    const learnedOutput = recentOutputTokens();
    const reservedOutput = Math.max(
      Math.min(Math.round(learnedOutput ?? ESTIMATED_OUTPUT_TOKENS), settings.llm.maxOutputTokens),
      256,
    );
    const planned = estimateTokens(system) + estimateTokens(user) + reservedOutput;
    if (remainingBefore < planned) {
      return skip(
        "budget_exhausted",
        `this cycle would need about ${planned} tokens but only ${Math.round(remainingBefore)} remain`,
      );
    }

    let llmCall = {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      model: settings.llm.model,
    };
    let text = "";
    const tLlm = Date.now();
    try {
      const call = await complete({
        provider: settings.llm.provider,
        model: settings.llm.model,
        apiKey,
        system,
        user,
        maxOutputTokens: settings.llm.maxOutputTokens,
        reasoningEffort: settings.llm.reasoningEffort,
        jsonMode: settings.llm.jsonMode,
      });
      text = call.text;
      llmCall = {
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        costUsd: call.costUsd,
        latencyMs: call.latencyMs,
        model: call.model,
      };
      insertLlmCall({
        runId,
        attempt: 1,
        provider: call.provider,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        costUsd: call.costUsd,
        latencyMs: call.latencyMs,
      });
      mark("llm_decision", tLlm, {
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        costUsd: call.costUsd,
      });
    } catch (error) {
      const message = describeError(error);
      finishRun(runId, { status: "error", snapshot, trace, error: message });
      updateEngineState({ lastTickAt: new Date().toISOString(), lastError: message });
      return { ...base, status: "error", error: message };
    }

    const tokens = {
      input: llmCall.inputTokens,
      output: llmCall.outputTokens,
      costUsd: llmCall.costUsd,
    };

    let parsed = parseDecision(text);
    for (let repairAttempt = 1; !parsed.ok && repairAttempt <= MAX_REPAIR_ATTEMPTS; repairAttempt += 1) {
      mark("parse_failed", Date.now(), `attempt ${repairAttempt}: ${parsed.error}`);
      try {
        const repair = await complete({
          provider: settings.llm.provider,
          model: settings.llm.model,
          apiKey,
          system,
          user: buildRepairPrompt(text, parsed.error),
          maxOutputTokens: settings.llm.maxOutputTokens,
          reasoningEffort: settings.llm.reasoningEffort,
          jsonMode: settings.llm.jsonMode,
        });
        insertLlmCall({
          runId,
          attempt: repairAttempt + 1,
          provider: repair.provider,
          model: repair.model,
          inputTokens: repair.inputTokens,
          outputTokens: repair.outputTokens,
          costUsd: repair.costUsd,
          latencyMs: repair.latencyMs,
        });
        tokens.input += repair.inputTokens;
        tokens.output += repair.outputTokens;
        tokens.costUsd += repair.costUsd;
        text = repair.text;
        mark("llm_repair", Date.now(), {
          attempt: repairAttempt,
          costUsd: repair.costUsd,
        });
        parsed = parseDecision(repair.text);
      } catch (error) {
        mark("repair_failed", Date.now(), `attempt ${repairAttempt}: ${describeError(error)}`);
        break;
      }
    }

    if (!parsed.ok) {
      finishRun(runId, {
        status: "error",
        snapshot,
        trace,
        error: parsed.error,
        tokensInput: tokens.input,
        tokensOutput: tokens.output,
        costUsd: tokens.costUsd,
      });
      updateEngineState({ lastTickAt: new Date().toISOString(), lastError: parsed.error });
      return { ...base, status: "error", error: parsed.error, tokens };
    }

    const decision = parsed.decision;
    mark("decision", Date.now(), decision);

    let gate = liveGate(settings);
    if (mode === "live" && gate.ok) {
      try {
        const auth = await authStatus({ host: settings.kit.host || undefined });
        if (!auth.auth_capable) {
          gate = {
            ok: false,
            reason: `missing credentials: ${auth.missing.join(", ")} (looked at ${auth.credentials_file.path})`,
          };
        }
      } catch (error) {
        gate = {
          ok: false,
          reason: `credential check failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    const verdict = evaluateDecision(decision, {
      settings,
      mode,
      liveGate: gate,
      snapshot,
      cyclesToday: cyclesTodayBefore,
      lastOrderFor: (symbol) => lastOrderAt(engineName, symbol),
      dailyPnlChange,
    });
    mark("guardrails", Date.now(), { allow: verdict.allow, codes: verdict.codes });

    if (!verdict.allow) {
      const summary = verdict.messages.join("; ") || "blocked by the risk layer";
      finishRun(runId, {
        status: "blocked",
        symbol: decision.symbol.toUpperCase(),
        action: decision.action,
        decision,
        snapshot,
        trace,
        error: summary,
        tokensInput: tokens.input,
        tokensOutput: tokens.output,
        costUsd: tokens.costUsd,
        latencyMs: llmCall.latencyMs,
        pnlAfter: snapshot.account?.totalPnl ?? null,
      });
      updateEngineState({ lastTickAt: new Date().toISOString() });
      // Take the snapshot anyway: a blocked cycle still moved mark prices, and
      // the daily-loss baseline is measured from the newest pre-midnight row.
      // Skipping it here would let the baseline drift further behind each cycle.
      await takeEquitySnapshot(mode, settings);
      return {
        ...base,
        status: "blocked",
        decision,
        error: summary,
        tokens,
        blockedBy: verdict.codes,
        messages: verdict.messages,
      };
    }

    if (!verdict.plan) {
      finishRun(runId, {
        status: "ok",
        symbol: decision.symbol.toUpperCase(),
        action: "hold",
        decision,
        snapshot,
        trace,
        tokensInput: tokens.input,
        tokensOutput: tokens.output,
        costUsd: tokens.costUsd,
        latencyMs: llmCall.latencyMs,
        pnlAfter: snapshot.account?.totalPnl ?? null,
      });
      updateEngineState({ lastTickAt: new Date().toISOString() });
      await takeEquitySnapshot(mode, settings);
      return { ...base, status: "ok", decision, tokens };
    }

    const plan = verdict.plan;
    let orderRecord: Record<string, unknown> | null = null;
    let filledSize: number | null = null;
    let unfilled: number | null = null;
    try {
      const tOrder = Date.now();
      const execution = await executePlan(plan, mode, settings);
      orderRecord = execution.raw;
      filledSize = execution.filledSize;
      unfilled = execution.unfilled;
      const avgPrice = execution.avgPrice;
      const noFill = filledSize !== null && filledSize <= 0;
      const partial =
        filledSize !== null && !noFill && filledSize + 1e-12 < plan.amount;

      // Book the fill, not the intent: a zero or partial fill is a different
      // trade than the one the model asked for.
      const actualNotional =
        avgPrice !== null && filledSize !== null ? Math.abs(filledSize * avgPrice) : null;

      insertOrder({
        runId,
        engine: mode,
        symbol: plan.symbol,
        side: plan.side,
        orderType: plan.orderType,
        amount: filledSize ?? plan.amount,
        price: plan.limitPrice,
        notionalUsd: actualNotional ?? plan.notionalUsd,
        clientOrderIndex: execution.clientOrderIndex,
        filledSize,
        avgPrice,
        fee: execution.fee,
        raw: execution.raw,
      });
      mark(mode === "paper" ? "paper_order" : "live_order", tOrder, {
        symbol: plan.symbol,
        side: plan.side,
        requestedAmount: plan.amount,
        filledSize,
        notionalUsd: actualNotional ?? plan.notionalUsd,
        partial,
      });
    } catch (error) {
      const message = describeError(error);
      mark("order_failed", Date.now(), message);
      finishRun(runId, {
        status: "error",
        symbol: plan.symbol,
        action: decision.action,
        decision,
        snapshot,
        trace,
        error: message,
        tokensInput: tokens.input,
        tokensOutput: tokens.output,
        costUsd: tokens.costUsd,
        latencyMs: llmCall.latencyMs,
      });
      updateEngineState({ lastTickAt: new Date().toISOString(), lastError: message });
      return { ...base, status: "error", decision, error: message, tokens };
    }

    await takeEquitySnapshot(mode, settings);

    // A zero fill is not a completed trade. Recording it as `ok` would put a
    // phantom order in the ledger that no position ever backed.
    if (filledSize !== null && filledSize <= 0) {
      const message = unfilled
        ? `order submitted but nothing filled (${unfilled} unfilled, likely no depth within the limit price)`
        : "order submitted but nothing filled";
      finishRun(runId, {
        status: "blocked",
        symbol: plan.symbol,
        action: decision.action,
        decision,
        snapshot,
        trace,
        order: orderRecord,
        error: message,
        tokensInput: tokens.input,
        tokensOutput: tokens.output,
        costUsd: tokens.costUsd,
        latencyMs: llmCall.latencyMs,
      });
      updateEngineState({ lastTickAt: new Date().toISOString() });
      return { ...base, status: "blocked", decision, order: orderRecord, error: message, tokens };
    }

    finishRun(runId, {
      status: "ok",
      symbol: plan.symbol,
      action: decision.action,
      decision,
      snapshot,
      trace,
      order: orderRecord,
      tokensInput: tokens.input,
      tokensOutput: tokens.output,
      costUsd: tokens.costUsd,
      latencyMs: llmCall.latencyMs,
    });
    updateEngineState({ lastTickAt: new Date().toISOString(), lastError: null });

    return {
      ...base,
      status: "ok",
      decision,
      order: orderRecord,
      tokens,
      messages: verdict.messages,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishRun(runId, { status: "error", trace, error: message });
    updateEngineState({ lastTickAt: new Date().toISOString(), lastError: message });
    return { ...base, status: "error", error: message };
  }
}
