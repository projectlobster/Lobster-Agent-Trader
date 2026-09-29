import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateDecision, type GuardrailFacts } from "@/lib/agent/guardrails";
import type { Decision } from "@/lib/agent/schema";
import type { MarketSnapshot } from "@/lib/agent/snapshot";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/store/settings";

const MARK = 84_000;

function settings(overrides: (draft: Settings) => void = () => {}): Settings {
  const draft = structuredClone(DEFAULT_SETTINGS);
  draft.risk.allowedSymbols = ["BTC", "ETH"];
  draft.risk.cooldownSeconds = 0;
  draft.risk.dailyLossLimitUsd = 1_000;
  overrides(draft);
  return draft;
}

function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    generatedAt: "2026-09-26T10:00:00.000Z",
    mode: "paper",
    host: "https://mainnet.zklighter.elliot.ai",
    symbols: [
      {
        symbol: "BTC",
        marketIndex: 1,
        markPrice: MARK,
        bestBid: MARK - 10,
        bestAsk: MARK + 10,
        spreadBps: 2.4,
        bidDepthUsd: 400_000,
        askDepthUsd: 380_000,
        change24hPct: -0.8,
        volume24hUsd: 550_000_000,
        openInterestUsd: 33_000_000,
        funding8hPct: 0.0022,
        fundingAnnualizedPct: 2.4,
        fundingByExchange: [{ exchange: "binance", rate: 0.000022 }],
        closes: [83_800, 84_000],
        candleResolution: "15m",
        precision: {
          sizeDecimals: 5,
          priceDecimals: 1,
          minBaseAmount: 0.00007,
          minQuoteAmount: 10,
        },
      },
    ],
    positions: [],
    account: {
      source: "paper",
      equity: 10_000,
      collateral: 10_000,
      unrealizedPnl: 0,
      totalPnl: 0,
      marginUsagePct: 0,
    },
    warnings: [],
    ...overrides,
  };
}

function facts(overrides: Partial<GuardrailFacts> = {}): GuardrailFacts {
  return {
    settings: settings(),
    mode: "paper",
    liveGate: { ok: true },
    snapshot: snapshot(),
    cyclesToday: 0,
    lastOrderFor: () => null,
    dailyPnlChange: 0,
    ...overrides,
  };
}

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    action: "open",
    symbol: "BTC",
    side: "long",
    size_usd: 100,
    order_type: "market",
    limit_price: null,
    confidence: 0.7,
    thesis: "test",
    invalidation: "test",
    horizon: "intraday",
    ...overrides,
  };
}

test("hold is always allowed and plans nothing", () => {
  const verdict = evaluateDecision(decision({ action: "hold", side: null, size_usd: 0 }), facts());
  assert.equal(verdict.allow, true);
  assert.equal(verdict.plan, null);
});

test("hold is allowed even when every other gate would fail", () => {
  const verdict = evaluateDecision(
    decision({ action: "hold", side: null, size_usd: 0, symbol: "DOGE", confidence: 0.1 }),
    facts({ cyclesToday: 999, dailyPnlChange: -9_999 }),
  );
  assert.equal(verdict.allow, true);
});

test("a symbol outside the allow-list is blocked", () => {
  const verdict = evaluateDecision(decision({ symbol: "DOGE" }), facts());
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("symbol_not_allowed"));
  assert.equal(verdict.plan, null);
});

test("confidence under the threshold is blocked", () => {
  const verdict = evaluateDecision(decision({ confidence: 0.4 }), facts());
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("low_confidence"));
});

test("size above the cap is clamped, not rejected", () => {
  const verdict = evaluateDecision(decision({ size_usd: 5_000 }), facts());
  assert.equal(verdict.allow, true);
  assert.ok(verdict.plan);
  assert.ok(verdict.plan.notionalUsd <= 250);
  assert.ok(verdict.messages.some((message) => message.includes("clamped")));
});

test("the clamped amount is rounded down to the market's size precision", () => {
  const verdict = evaluateDecision(decision({ size_usd: 250 }), facts());
  // 250 / 84000 = 0.002976190… -> 5 decimals, floored
  assert.equal(verdict.plan?.amount, 0.00297);
});

test("an order under the minimum notional is blocked", () => {
  const verdict = evaluateDecision(decision({ size_usd: 5 }), facts());
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("below_min_notional"));
});

test("a spot pair is rejected outright", () => {
  const verdict = evaluateDecision(decision({ symbol: "ETH/USDC" }), facts());
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("perp_only"));
});

test("open without a side is blocked", () => {
  const verdict = evaluateDecision(decision({ side: null }), facts());
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("missing_side"));
});

test("a symbol with no market data is blocked", () => {
  const verdict = evaluateDecision(decision({ symbol: "ETH" }), facts());
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("market_unavailable"));
});

test("ioc without a limit price is blocked", () => {
  const verdict = evaluateDecision(
    decision({ order_type: "ioc", limit_price: null }),
    facts(),
  );
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("missing_limit_price"));
});

test("ioc is accepted in paper when it carries a limit price", () => {
  const verdict = evaluateDecision(
    decision({ order_type: "ioc", limit_price: MARK + 50 }),
    facts(),
  );
  assert.equal(verdict.allow, true);
  assert.equal(verdict.plan?.orderType, "ioc");
});

test("live rejects ioc outright", () => {
  const verdict = evaluateDecision(
    decision({ order_type: "ioc", limit_price: MARK + 50 }),
    facts({ mode: "live", liveGate: { ok: true } }),
  );
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("ioc_not_supported_live"));
});

test("live with a closed gate is blocked", () => {
  const verdict = evaluateDecision(
    decision(),
    facts({ mode: "live", liveGate: { ok: false, reason: "switch is off" } }),
  );
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("live_gate_closed"));
  assert.ok(verdict.messages.some((message) => message.includes("switch is off")));
});

test("closing without a position is blocked", () => {
  const verdict = evaluateDecision(
    decision({ action: "close", side: null, size_usd: 0 }),
    facts(),
  );
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("no_position_to_close"));
});

test("closing an open long mirrors the side and marks reduce-only", () => {
  const verdict = evaluateDecision(
    decision({ action: "close", side: null, size_usd: 0 }),
    facts({
      snapshot: snapshot({
        positions: [
          {
            symbol: "BTC",
            marketIndex: 1,
            side: "long",
            size: 0.00301,
            avgEntryPrice: 83_000,
            markPrice: MARK,
            unrealizedPnl: 3,
            notionalUsd: 252,
            liquidationPrice: 60_000,
          },
        ],
      }),
    }),
  );
  assert.equal(verdict.allow, true);
  assert.equal(verdict.plan?.kind, "close");
  assert.equal(verdict.plan?.side, "short");
  assert.equal(verdict.plan?.reduceOnly, true);
  assert.equal(verdict.plan?.amount, 0.00301);
});

test("the cooldown blocks a second order on the same symbol", () => {
  const verdict = evaluateDecision(
    decision(),
    facts({
      settings: settings((draft) => {
        draft.risk.cooldownSeconds = 300;
      }),
      lastOrderFor: (symbol) =>
        symbol === "BTC" ? new Date(Date.now() - 5_000).toISOString() : null,
    }),
  );
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("cooldown_active"));
});

test("a recent order on another symbol does not block this one", () => {
  const verdict = evaluateDecision(
    decision(),
    facts({
      settings: settings((draft) => {
        draft.risk.cooldownSeconds = 300;
      }),
      // Only ETH was traded recently.
      lastOrderFor: (symbol) =>
        symbol === "ETH" ? new Date(Date.now() - 5_000).toISOString() : null,
    }),
  );
  assert.equal(verdict.allow, true);
});

test("an expired cooldown does not block", () => {
  const verdict = evaluateDecision(
    decision(),
    facts({
      settings: settings((draft) => {
        draft.risk.cooldownSeconds = 60;
      }),
      lastOrderFor: () => new Date(Date.now() - 120_000).toISOString(),
    }),
  );
  assert.equal(verdict.allow, true);
});

test("the daily cycle cap is enforced", () => {
  const verdict = evaluateDecision(decision(), facts({ cyclesToday: 48 }));
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("cycle_limit_reached"));
});

test("the daily loss limit is enforced", () => {
  const verdict = evaluateDecision(decision(), facts({ dailyPnlChange: -1_000 }));
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("daily_loss_limit"));
});

test("the position count cap is enforced for a new symbol", () => {
  const positions = ["BTC", "ETH", "SOL"].map((symbol) => ({
    symbol,
    marketIndex: 1,
    side: "long" as const,
    size: 0.001,
    avgEntryPrice: MARK,
    markPrice: MARK,
    unrealizedPnl: 0,
    notionalUsd: 84,
    liquidationPrice: 0,
  }));
  // LTC is allowed and priced, but three other positions are already open.
  const verdict = evaluateDecision(
    decision({ symbol: "LTC" }),
    facts({
      settings: settings((draft) => {
        draft.risk.maxOpenPositions = 3;
        draft.risk.allowedSymbols = ["BTC", "ETH", "SOL", "LTC"];
      }),
      snapshot: snapshot({
        symbols: [...snapshot().symbols, { ...snapshot().symbols[0], symbol: "LTC" }],
        positions,
      }),
    }),
  );
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("max_positions_reached"));
});

test("adding to an existing position does not trip the position cap", () => {
  const verdict = evaluateDecision(
    decision({ symbol: "BTC" }),
    facts({
      settings: settings((draft) => {
        draft.risk.maxOpenPositions = 1;
      }),
      snapshot: snapshot({
        positions: [
          {
            symbol: "BTC",
            marketIndex: 1,
            side: "long",
            size: 0.001,
            avgEntryPrice: MARK,
            markPrice: MARK,
            unrealizedPnl: 0,
            notionalUsd: 84,
            liquidationPrice: 0,
          },
        ],
      }),
    }),
  );
  assert.equal(verdict.allow, true);
});

test("projected leverage above the cap is blocked", () => {
  const verdict = evaluateDecision(
    decision({ size_usd: 250 }),
    facts({
      snapshot: snapshot({
        account: {
          source: "paper",
          equity: 50,
          collateral: 50,
          unrealizedPnl: 0,
          totalPnl: 0,
          marginUsagePct: 0,
        },
      }),
    }),
  );
  assert.equal(verdict.allow, false);
  assert.ok(verdict.codes.includes("leverage_exceeded"));
});

test("blocked verdicts never leak an executable plan", () => {
  const verdict = evaluateDecision(decision({ symbol: "DOGE" }), facts());
  assert.equal(verdict.plan, null);
});

test("multiple violations are all reported", () => {
  const verdict = evaluateDecision(
    decision({ symbol: "DOGE", confidence: 0.1 }),
    facts({ cyclesToday: 99, dailyPnlChange: -5_000 }),
  );
  assert.equal(verdict.allow, false);
  for (const code of ["symbol_not_allowed", "low_confidence", "cycle_limit_reached", "daily_loss_limit"]) {
    assert.ok(verdict.codes.includes(code), `expected ${code}`);
  }
});
