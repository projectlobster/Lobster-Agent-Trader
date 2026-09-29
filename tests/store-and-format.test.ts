import assert from "node:assert/strict";
import { test } from "node:test";
import { allowanceOf, periodKeyFor, previousPeriodKey } from "@/lib/store/periods";
import { costUsd, priceFor, MODEL_PRICES } from "@/lib/llm/pricing";
import { lintSettings } from "@/lib/settings-lint";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/store/settings";
import { compact, pct, signedUsd, usd } from "@/lib/format";

test("period keys follow the reset day", () => {
  assert.equal(periodKeyFor(new Date("2026-09-26T12:00:00Z"), 1), "2026-09");
  assert.equal(periodKeyFor(new Date("2026-09-20T12:00:00Z"), 15), "2026-09");
  assert.equal(periodKeyFor(new Date("2026-09-10T12:00:00Z"), 15), "2026-08");
  assert.equal(periodKeyFor(new Date("2026-01-05T12:00:00Z"), 1), "2026-01");
  assert.equal(periodKeyFor(new Date("2026-01-05T12:00:00Z"), 15), "2025-12");
});

test("period keys are clamped to a sane reset day", () => {
  // 99 clamps to 28, so the 29th opens the new period; 0 clamps to 1.
  assert.equal(periodKeyFor(new Date("2026-09-29T12:00:00Z"), 99), "2026-09");
  assert.equal(periodKeyFor(new Date("2026-09-26T12:00:00Z"), 99), "2026-08");
  assert.equal(periodKeyFor(new Date("2026-09-26T12:00:00Z"), 0), "2026-09");
});

test("previousPeriodKey rolls the year over", () => {
  assert.equal(previousPeriodKey("2026-01"), "2025-12");
  assert.equal(previousPeriodKey("2026-09"), "2026-08");
});

test("allowance is budget minus reserved plus carry-over", () => {
  assert.equal(
    allowanceOf({
      period_key: "2026-09",
      budget_tokens: 6_000_000,
      reserved_tokens: 5_000_000,
      carry_in_tokens: 250_000,
      created_at: "",
    }),
    1_250_000,
  );
});

test("allowance never goes negative when reserved exceeds budget", () => {
  assert.equal(
    allowanceOf({
      period_key: "2026-09",
      budget_tokens: 1_000,
      reserved_tokens: 5_000,
      carry_in_tokens: 0,
      created_at: "",
    }),
    0,
  );
});

test("free models cost nothing", () => {
  assert.equal(costUsd("openrouter", "inclusionai/ling-3.0-flash-sante:free", 1_000_000, 1_000_000), 0);
});

test("paid pricing is applied per million tokens", () => {
  assert.equal(costUsd("anthropic", "claude-sonnet-4-5", 1_000_000, 0), 3);
  assert.equal(costUsd("anthropic", "claude-sonnet-4-5", 0, 1_000_000), 15);
  assert.equal(costUsd("anthropic", "claude-sonnet-4-5", 500_000, 100_000), 3);
});

test("an unknown model falls back instead of costing zero", () => {
  const price = priceFor("openrouter", "some/unlisted-model");
  assert.ok(price.inputPerMillion > 0);
  assert.ok(price.outputPerMillion > 0);
});

test("every listed model has a provider and a price", () => {
  for (const model of MODEL_PRICES) {
    assert.ok(["anthropic", "openai", "openrouter"].includes(model.provider), model.model);
    assert.ok(model.inputPerMillion >= 0, model.model);
    assert.ok(model.outputPerMillion >= 0, model.model);
  }
});

function settings(overrides: (draft: Settings) => void): Settings {
  const draft = structuredClone(DEFAULT_SETTINGS);
  draft.agent.watchlist = ["BTC", "ETH"];
  draft.risk.allowedSymbols = ["BTC", "ETH"];
  overrides(draft);
  return draft;
}

test("a clean configuration produces no warnings", () => {
  assert.deepEqual(lintSettings(settings(() => {})), []);
});

test("a watchlist symbol outside the allow-list is flagged", () => {
  const warnings = lintSettings(
    settings((draft) => {
      draft.agent.watchlist = ["BTC", "DOGE"];
    }),
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /DOGE/);
});

test("reserved budget above the monthly budget is flagged", () => {
  const warnings = lintSettings(
    settings((draft) => {
      draft.budget.monthlyTokens = 1_000;
      draft.budget.reservedForWork = 5_000;
    }),
  );
  assert.ok(warnings.some((warning) => warning.includes("tradable allowance")));
});

test("an empty watchlist is flagged", () => {
  const warnings = lintSettings(
    settings((draft) => {
      draft.agent.watchlist = [];
    }),
  );
  assert.ok(warnings.some((warning) => warning.includes("watchlist is empty")));
});

test("a notional cap under the venue minimum is flagged", () => {
  const warnings = lintSettings(
    settings((draft) => {
      draft.risk.maxNotionalUsd = 5;
    }),
  );
  assert.ok(warnings.some((warning) => warning.includes("$10")));
});

test("money formatting is stable", () => {
  assert.equal(usd(1234.5), "$1,234.50");
  assert.equal(signedUsd(-12.5), "-$12.50");
  assert.equal(signedUsd(12.5), "+$12.50");
  assert.equal(pct(0.1234, 1), "12.3%");
  assert.equal(compact(1_250_000), "1.3M");
  assert.equal(compact(999), "999");
});
