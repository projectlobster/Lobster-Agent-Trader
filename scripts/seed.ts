import { randomUUID } from "node:crypto";
import { getAll, getDb, run } from "@/lib/store/db";
import { readSettings } from "@/lib/store/settings";
import { getOrCreatePeriod, periodKeyFor } from "@/lib/store/periods";
import { loadDotEnv } from "@/lib/load-env";

const MODELS: Record<string, { provider: string; input: number; output: number }> = {
  "claude-sonnet-4-5": { provider: "anthropic", input: 3, output: 15 },
  "claude-haiku-4-5": { provider: "anthropic", input: 1, output: 5 },
  "gpt-5-mini": { provider: "openai", input: 0.25, output: 2 },
};

const THESES = [
  "Fifteen-minute closes keep grinding up without the ask side thickening, so take a small position with the short-term momentum and stop under the previous 15m low.",
  "Funding is still positive while price goes sideways, so longs keep paying for the privilege. Lean short into a pullback and wait for funding to flip before reversing.",
  "Bid and ask depth are near balance and the 24h range is compressing. No identifiable edge, so wait for the range to break.",
  "Two long upper wicks in a row swallowed the prior move and short-term momentum is fading, so cut the position in half and keep a watching size.",
  "Less than 1% below the overhead volume shelf; the risk-reward is not worth it, so stand aside.",
];

const INVALIDATIONS = [
  "A close above the prior 15m high on rising volume invalidates the read.",
  "Funding flipping negative at the next settlement means shorts are crowded and the idea needs rethinking.",
  "A 15m close outside the range boundary falsifies the range assumption.",
  "Depth thickening on one side of the book means directional money has arrived.",
];

const SYMBOLS = ["BTC", "ETH", "SOL"];
const PRICES: Record<string, number> = { BTC: 83_990, ETH: 2_245, SOL: 141 };

function pick<T>(items: T[], index: number): T {
  return items[index % items.length];
}

loadDotEnv();

function main() {
  getDb();
  const settings = readSettings();
  const existing = getAll<{ n: number }>("SELECT COUNT(*) AS n FROM runs")[0]?.n ?? 0;

  if (existing > 0) {
    console.log(`  ${existing} runs already exist — refusing to seed on top of real data.`);
    console.log("  delete data/lighter-trader.db to start over.\n");
    return;
  }

  const period = getOrCreatePeriod(settings);
  const now = Date.now();
  const model = settings.llm.model in MODELS ? settings.llm.model : "claude-sonnet-4-5";
  const modelInfo = MODELS[model];

  const statuses = [
    "ok",
    "ok",
    "blocked",
    "ok",
    "skipped",
    "ok",
    "error",
    "ok",
    "blocked",
    "ok",
    "ok",
    "skipped",
    "ok",
    "ok",
    "blocked",
    "ok",
    "ok",
    "ok",
  ];

  let pnl = 0;

  statuses.forEach((status, index) => {
    const startedAt = new Date(now - (statuses.length - index) * 4.5 * 3600 * 1000);
    const id = randomUUID();
    const symbol = status === "skipped" ? null : pick(SYMBOLS, index);
    const action = status === "skipped" ? null : pick(["open", "hold", "close", "open"], index);
    const decision =
      action === null
        ? null
        : {
            action,
            symbol,
            side: action === "open" ? (index % 3 === 0 ? "long" : "short") : null,
            size_usd: action === "open" ? 120 + (index % 4) * 30 : 0,
            order_type: "market",
            limit_price: null,
            confidence: action === "hold" ? 0.41 : 0.58 + (index % 5) * 0.05,
            thesis: pick(THESES, index),
            invalidation: pick(INVALIDATIONS, index + 1),
            horizon: index % 2 === 0 ? "intraday" : "swing",
          };

    const inputTokens = 3_400 + (index % 6) * 420;
    const outputTokens = 260 + (index % 4) * 90;
    const costUsd =
      (inputTokens / 1_000_000) * modelInfo.input + (outputTokens / 1_000_000) * modelInfo.output;

    let blockReason: string | null = null;
    let stopReason: string | null = null;
    if (status === "blocked") {
      blockReason =
        index % 2 === 0
          ? "confidence 0.52 is below the 0.55 threshold"
          : `projected account leverage 3.41x exceeds the ${settings.risk.maxLeverage}x limit`;
    }
    if (status === "skipped") {
      stopReason = index % 4 === 1 ? "cooldown_active" : "budget_exhausted";
    }
    if (status === "error") {
      stopReason = null;
    }

    pnl += status === "ok" && action === "close" ? 6.4 : status === "ok" ? -1.15 : 0;

    run(
      `INSERT INTO runs (
         id, period_key, started_at, finished_at, mode, status, symbol, action,
         decision_json, snapshot_json, trace_json, order_json,
         tokens_input, tokens_output, cost_usd, latency_ms, pnl_after, error, stop_reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      period.period_key,
      startedAt.toISOString(),
      new Date(startedAt.getTime() + 4_200).toISOString(),
      "paper",
      status,
      symbol,
      action,
      decision === null ? null : JSON.stringify(decision),
      JSON.stringify({
        generatedAt: startedAt.toISOString(),
        mode: "paper",
        host: settings.kit.host,
        symbols: SYMBOLS.map((ticker) => ({
          symbol: ticker,
          markPrice: PRICES[ticker],
          change24hPct: -0.82 + index * 0.07,
          volume24hUsd: 554_138_945,
        })),
        positions: [],
        account: { source: "paper", equity: 10_000, collateral: 10_000, unrealizedPnl: pnl, totalPnl: pnl },
        warnings: [],
      }),
      JSON.stringify([
        { step: "market_snapshot", ms: 980 + index * 12 },
        { step: "llm_decision", ms: 1_800 + index * 40 },
        { step: "guardrails", allow: status !== "blocked" },
      ]),
      status === "ok" && action === "open"
        ? JSON.stringify({
            status: "ok",
            symbol,
            filled_size: 0.0014,
            avg_price: PRICES[symbol ?? "BTC"],
            total_fee: 0.07,
          })
        : null,
      inputTokens,
      outputTokens,
      costUsd,
      1_800 + index * 40,
      pnl,
      blockReason ?? (status === "error" ? "lighter-agent-kit order call failed: connect timeout" : null),
      stopReason,
    );

    run(
      `INSERT INTO llm_calls (run_id, attempt, provider, model, input_tokens, output_tokens, cost_usd, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      1,
      modelInfo.provider,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      1_800 + index * 40,
      startedAt.toISOString(),
    );

    if (status === "ok" && action === "open" && symbol) {
      run(
        `INSERT INTO orders (run_id, engine, symbol, side, order_type, amount, price, notional_usd, filled_size, avg_price, fee, raw_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        "paper",
        symbol,
        index % 3 === 0 ? "long" : "short",
        "market",
        0.0014,
        null,
        120 + (index % 4) * 30,
        0.0014,
        PRICES[symbol],
        0.07,
        JSON.stringify({ status: "ok", symbol, filled_size: 0.0014 }),
        startedAt.toISOString(),
      );
    }
  });

  const equityPoints = 26;
  for (let index = 0; index < equityPoints; index += 1) {
    const at = new Date(now - (equityPoints - index) * 1.6 * 3600 * 1000);
    // Keep the intraday swing well under the default daily-loss limit: sample
    // data that trips a guardrail would block a brand-new install's first
    // "Run once" for a loss the user never took. The chart auto-scales to
    // [min, max], so a small amplitude still renders as a full curve.
    const drift = Math.sin(index / 2.2) * 5 + index * 0.1;
    run(
      `INSERT INTO equity (taken_at, mode, equity, collateral, unrealized_pnl, total_pnl, initial_collateral)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      at.toISOString(),
      "paper",
      10_000 + drift,
      10_000 + drift,
      0,
      drift,
      10_000,
    );
  }

  const periodKey = periodKeyFor(new Date(now), settings.budget.resetDay);
  console.log(`  seeded ${statuses.length} runs, ${statuses.length} llm_calls, 26 equity points`);
  console.log(`  period ${periodKey} · tradable allowance ${period.budget_tokens - period.reserved_tokens} tok`);
  console.log("  open http://127.0.0.1:3210/console\n");
}

main();
