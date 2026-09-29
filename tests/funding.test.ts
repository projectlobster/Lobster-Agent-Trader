import assert from "node:assert/strict";
import { test } from "node:test";
import { selectFundingRate } from "@/lib/agent/snapshot";

// Regression: the snapshot used to prefer the Binance funding row as the
// "representative" rate. Cross-venue rates can disagree on sign — SOL showed
// -0.0021% on Binance (shorts paid) and +0.0064% on Lighter (longs paid) — so
// that inverted the carry signal the model trades on.
test("Lighter's own rate wins over any other venue", () => {
  const pick = selectFundingRate([
    { exchange: "binance", rate: 0.000021 },
    { exchange: "lighter", rate: 0.000096 },
  ]);
  assert.equal(pick.representative?.exchange, "lighter");
});

test("a sign disagreement between venues resolves to the Lighter sign", () => {
  const pick = selectFundingRate([
    { exchange: "binance", rate: -0.000021 },
    { exchange: "lighter", rate: 0.000064 },
  ]);
  // Longs pay on Lighter even though Binance shows shorts being paid.
  assert.ok((pick.representative?.rate ?? 0) > 0);
  assert.ok((pick.annualizedPct ?? 0) > 0);
});

test("exchange matching is case insensitive", () => {
  const pick = selectFundingRate([
    { exchange: "Binance", rate: 0.00001 },
    { exchange: "LIGHTER", rate: 0.00009 },
  ]);
  assert.equal(pick.representative?.exchange, "LIGHTER");
});

test("binance is the fallback when Lighter publishes nothing", () => {
  const pick = selectFundingRate([
    { exchange: "bybit", rate: 0.00004 },
    { exchange: "binance", rate: 0.00002 },
  ]);
  assert.equal(pick.representative?.exchange, "binance");
});

test("the first row is used when neither known venue is present", () => {
  const pick = selectFundingRate([{ exchange: "hyperliquid", rate: 0.0001 }]);
  assert.equal(pick.representative?.exchange, "hyperliquid");
});

test("no rows yields nulls rather than NaN", () => {
  const pick = selectFundingRate([]);
  assert.equal(pick.representative, null);
  assert.equal(pick.annualizedPct, null);
  assert.deepEqual(pick.byExchange, []);
});

test("annualisation assumes the API's 8-hour-equivalent rate (3x daily)", () => {
  const pick = selectFundingRate([{ exchange: "lighter", rate: 0.0001 }]);
  // 0.0001 -> 0.01% per 8h -> 10.95% a year
  assert.ok(Math.abs((pick.annualizedPct ?? 0) - 10.95) < 0.01);
});

test("only the first four venues are carried into the snapshot", () => {
  const pick = selectFundingRate(
    Array.from({ length: 9 }, (_, i) => ({ exchange: `venue-${i}`, rate: 0.0001 })),
  );
  assert.equal(pick.byExchange.length, 4);
});
