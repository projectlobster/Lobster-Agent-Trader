import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Environment has to be in place before the agent modules are first used.
const scratch = mkdtempSync(join(tmpdir(), "lt-loop-"));
process.env.LIGHTER_TRADER_DB = join(scratch, "loop.db");
process.env.LIGHTER_TRADER_ANTHROPIC_API_KEY = "stub-key";
process.env.LIGHTER_ENABLE_LIVE = "0";
process.env.LIGHTER_TRADER_KIT_TIMEOUT_MS = "30000";

const { installFakeKit, defaultStubs } = await import("./helpers/fake-kit");
const kit = installFakeKit(defaultStubs());

const { clearKitCache } = await import("@/lib/kit/locate");
const { clearResponseCache } = await import("@/lib/kit/cache");
clearKitCache();

const { tick } = await import("@/lib/agent/loop");
const { runOnce, stopEngine, engineStatus } = await import("@/lib/agent/engine");
const { leaseHolder } = await import("@/lib/store/engine");
const { writeSettings } = await import("@/lib/store/settings");
const { listOrders } = await import("@/lib/store/orders");
const { listRuns } = await import("@/lib/store/runs");
const { listEquity } = await import("@/lib/store/equity");
const { listLlmCalls } = await import("@/lib/store/llm");
const { run: sql } = await import("@/lib/store/db");

const realFetch = globalThis.fetch;
let decision: Record<string, unknown> = {};
let failNextLlmWith: string | null = null;
let llmDelayMs = 0;
let llmCalls = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("api.anthropic.com")) return realFetch(input, init);

  llmCalls += 1;
  if (llmDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, llmDelayMs));
  if (failNextLlmWith) {
    return new Response(JSON.stringify({ error: { message: failNextLlmWith } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(decision) }],
      usage: { input_tokens: 3_000, output_tokens: 400 },
      model: "claude-sonnet-4-5",
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof fetch;

function resetRunData() {
  // Market reads are cached across cycles; clear it so a stubbed change in one
  // test cannot leak into the next.
  clearResponseCache();
  sql("DELETE FROM orders");
  sql("DELETE FROM runs");
  sql("DELETE FROM llm_calls");
  sql("DELETE FROM equity");
}

function openDecision(overrides: Record<string, unknown> = {}) {
  return {
    action: "open",
    symbol: "BTC",
    side: "long",
    size_usd: 100,
    order_type: "market",
    limit_price: null,
    confidence: 0.8,
    thesis: "test fixture.",
    invalidation: "test fixture.",
    horizon: "intraday",
    ...overrides,
  };
}

function riskStubs(overrides: Record<string, unknown> = {}) {
  return {
    allowedSymbols: ["BTC"],
    maxNotionalUsd: 250,
    maxLeverage: 3,
    maxOpenPositions: 2,
    maxCyclesPerDay: 50,
    cooldownSeconds: 0,
    minConfidence: 0.5,
    dailyLossLimitUsd: 1_000,
    ...overrides,
  };
}

function configure(overrides: Record<string, unknown> = {}) {
  writeSettings({
    mode: "paper",
    liveEnabled: false,
    kit: { paperStatePath: join(scratch, "paper.json"), host: "https://mainnet.zklighter.elliot.ai" },
    agent: { watchlist: ["BTC"], bookDepth: 3, candleCountBack: 2, candleResolution: "15m" },
    llm: { provider: "anthropic", model: "claude-sonnet-4-5" },
    risk: riskStubs(),
    budget: { monthlyTokens: 6_000_000, reservedForWork: 5_000_000, carryOverLeftover: false },
    ...overrides,
  });
}

test("a hold decision records a run, spends tokens, and places no order", async () => {
  configure();
  resetRunData();
  decision = openDecision({ action: "hold", side: null, size_usd: 0 });

  const result = await tick({ trigger: "manual" });

  assert.equal(result.status, "ok");
  assert.equal(result.order, null);
  assert.equal(result.tokens.input, 3_000);
  assert.equal(result.tokens.output, 400);
  assert.ok(result.tokens.costUsd > 0, "cost should come from the price table");
  assert.equal(listOrders().length, 0);

  const [run] = listRuns({ limit: 1 });
  assert.equal(run.status, "ok");
  assert.equal(run.action, "hold");
  assert.equal(run.tokens_input, 3_000);
  assert.ok(run.snapshot_json, "the market snapshot is archived for review");
  assert.ok(run.trace_json, "the trace is archived for review");
  assert.equal(listLlmCalls(run.id).length, 1);
});

test("an open decision books the fill, not the requested size", async () => {
  configure();
  resetRunData();
  decision = openDecision({ size_usd: 250 });

  const result = await tick({ trigger: "manual" });

  assert.equal(result.status, "ok");
  const [order] = listOrders();
  assert.ok(order, "expected an order row");
  assert.equal(order.symbol, "BTC");
  assert.equal(order.engine, "paper");
  // The stub fills 0.001 @ 84000 = $84, well under the $250 request.
  assert.equal(order.filled_size, 0.001);
  assert.equal(order.avg_price, 84_000);
  assert.equal(order.notional_usd, 84);
  assert.ok(
    order.notional_usd < 250,
    "notional must reflect the fill, not the plan",
  );
});

test("a zero fill is recorded as blocked rather than a phantom trade", async () => {
  configure();
  resetRunData();
  kit.setStub("paper order market", {
    status: "ok",
    symbol: "BTC",
    market_id: 1,
    side: "long",
    order_type: "market",
    filled_size: 0,
    avg_price: 0,
    total_fee: 0,
    quote_amount: 0,
    unfilled: 0.003,
    liquidated: false,
    fills_count: 0,
  });
  decision = openDecision();

  const result = await tick({ trigger: "manual" });

  assert.equal(result.status, "blocked");
  assert.match(String(result.error), /nothing filled/);
  const [order] = listOrders();
  assert.equal(order?.filled_size, 0);
  // Restore the filling stub for later tests.
  kit.setStub("paper order market", defaultStubs()["paper order market"]);
});

test("a guardrail block still archives the reason and takes no order", async () => {
  configure();
  resetRunData();
  decision = openDecision({ confidence: 0.1 });

  const result = await tick({ trigger: "manual" });

  assert.equal(result.status, "blocked");
  assert.ok(result.blockedBy.includes("low_confidence"));
  assert.equal(listOrders().length, 0);
  const [run] = listRuns({ limit: 1 });
  assert.equal(run.status, "blocked");
  assert.match(String(run.error), /confidence/);
});

test("an unparseable reply is repaired on the second attempt", async () => {
  configure();
  resetRunData();
  decision = openDecision({ action: "hold", side: null, size_usd: 0 });

  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("api.anthropic.com")) return realFetch(input, init);
    call += 1;
    const text = call === 1 ? "not json at all" : JSON.stringify(decision);
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text }],
        usage: { input_tokens: 3_000, output_tokens: 120 },
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await tick({ trigger: "manual" });

  assert.equal(result.status, "ok", `expected repair to succeed, got ${result.error}`);
  assert.equal(call, 2, "the repair attempt should have run exactly once");
  assert.equal(result.tokens.input, 6_000, "both calls are billed to the run");

  const [run] = listRuns({ limit: 1 });
  assert.equal(listLlmCalls(run.id).length, 2);
  assert.equal(listLlmCalls(run.id)[1].attempt, 2);

  globalThis.fetch = original;
});

test("an exhausted token budget skips the cycle before any LLM call", async () => {
  configure({ budget: { monthlyTokens: 5_000_001, reservedForWork: 5_000_000, carryOverLeftover: false } });
  resetRunData();
  const before = llmCalls;

  const result = await tick({ trigger: "manual" });

  assert.equal(result.status, "skipped");
  assert.equal(result.stopReason, "budget_exhausted");
  assert.equal(llmCalls, before, "no tokens may be spent once the allowance is gone");
  assert.equal(listOrders().length, 0);
});

test("an LLM failure lands as an error run with the provider's own diagnostic", async () => {
  configure();
  resetRunData();
  failNextLlmWith = "model is overloaded";
  decision = openDecision();

  const result = await tick({ trigger: "manual" });

  assert.equal(result.status, "error");
  assert.match(String(result.error), /HTTP 400/);
  assert.match(String(result.error), /model is overloaded/);
  const [run] = listRuns({ limit: 1 });
  assert.equal(run.status, "error");
  failNextLlmWith = null;
});

// Regression: stopEngine used to release the cross-process lease unconditionally.
// Stopping the engine mid-cycle therefore freed the lock while a tick was still
// running, letting the headless worker start a second, concurrent cycle.
test("stopping the engine mid-cycle does not release the lease", async () => {
  configure();
  resetRunData();
  decision = openDecision({ action: "hold", side: null, size_usd: 0 });
  llmDelayMs = 1_200;

  const inFlight = runOnce();
  await new Promise((resolve) => setTimeout(resolve, 350));

  assert.ok(engineStatus().ticking, "the cycle should be in flight");
  assert.ok(leaseHolder().owner, "the lease should be held during a cycle");

  stopEngine("test");

  assert.ok(
    leaseHolder().owner,
    "the lease must survive a stop that lands mid-cycle",
  );
  assert.ok(engineStatus().ticking, "the cycle itself must still be allowed to finish");

  const attempt = await inFlight;
  llmDelayMs = 0;

  assert.equal(attempt.kind, "ran");
  assert.equal(
    leaseHolder().owner,
    null,
    "the finished cycle should release the lease itself",
  );
});

test("a fresh cross-cycle run can take the lease once the previous one finished", async () => {
  configure();
  resetRunData();
  decision = openDecision({ action: "hold", side: null, size_usd: 0 });

  await runOnce();
  assert.equal(leaseHolder().owner, null);

  const second = await runOnce();
  assert.equal(second.kind, "ran");
  assert.equal(leaseHolder().owner, null);
});

test("equity is snapshotted even for a blocked cycle", async () => {
  configure();
  resetRunData();
  decision = openDecision({ symbol: "DOGE", confidence: 0.9 });

  const result = await tick({ trigger: "manual" });

  assert.equal(result.status, "blocked");
  assert.ok(
    listEquity(10, "paper").length > 0,
    "blocked cycles must still advance the equity series, or the daily-loss baseline drifts",
  );
});

// Regression: the daily cycle cap was enforced only inside the risk layer, i.e.
// after the LLM call. Once the cap was hit, every remaining interval still paid
// for a full completion just to be told no — the opposite of this project's
// whole premise. It also counted the in-flight run, so "maxCyclesPerDay: 2"
// really meant one cycle.
test("the daily cycle cap is enforced before any token is spent", async () => {
  configure({ risk: riskStubs({ maxCyclesPerDay: 2 }) });
  resetRunData();
  decision = openDecision({ action: "hold", side: null, size_usd: 0 });

  const first = await tick({ trigger: "manual" });
  const second = await tick({ trigger: "manual" });
  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok", "the cap of 2 must actually allow two cycles");

  const callsBefore = llmCalls;
  const third = await tick({ trigger: "manual" });

  assert.equal(third.status, "skipped");
  assert.equal(third.stopReason, "cycle_limit_reached");
  assert.equal(llmCalls, callsBefore, "a capped cycle must not call the model");
  assert.equal(third.tokens.input, 0);
  assert.equal(listOrders().length, 0);
});

test("a cycle-limit stop halts the engine instead of burning intervals", async () => {
  configure({ risk: riskStubs({ maxCyclesPerDay: 1 }) });
  resetRunData();
  decision = openDecision({ action: "hold", side: null, size_usd: 0 });

  await runOnce();
  const second = await runOnce();

  assert.equal(second.kind, "ran");
  assert.equal(second.kind === "ran" ? second.result.stopReason : null, "cycle_limit_reached");
  assert.equal(engineStatus().running, false, "the engine should stop, not idle");
});

test("cleanup", () => {
  kit.restore();
});
