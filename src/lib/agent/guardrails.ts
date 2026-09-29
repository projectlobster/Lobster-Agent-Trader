import type { Settings, TradingMode } from "@/lib/store/settings";
import type { Decision } from "./schema";
import type { MarketSnapshot, PositionView, SymbolSnapshot } from "./snapshot";

export type ExecutionPlan = {
  kind: "open" | "close";
  symbol: string;
  side: "long" | "short";
  amount: number;
  notionalUsd: number;
  orderType: "market" | "ioc";
  limitPrice: number | null;
  reduceOnly: boolean;
  priceDecimals: number;
  sizeDecimals: number;
  markPrice: number;
};

export type Verdict = {
  allow: boolean;
  codes: string[];
  messages: string[];
  plan: ExecutionPlan | null;
};

export type GuardrailFacts = {
  settings: Settings;
  mode: TradingMode;
  liveGate: { ok: boolean; reason?: string };
  snapshot: MarketSnapshot;
  cyclesToday: number;
  /**
   * Newest order for the symbol under evaluation, per engine. Resolved inside
   * evaluateDecision because the symbol is only known here — a global
   * "last order" would make a BTC entry block an unrelated ETH one.
   */
  lastOrderFor: (symbol: string) => string | null;
  dailyPnlChange: number;
  now?: Date;
};

function roundDown(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

function positionFor(positions: PositionView[], symbol: string): PositionView | undefined {
  const upper = symbol.toUpperCase();
  return positions.find((p) => p.symbol.toUpperCase() === upper);
}

function symbolSnapshot(snapshot: MarketSnapshot, symbol: string): SymbolSnapshot | undefined {
  const upper = symbol.toUpperCase();
  return snapshot.symbols.find((s) => s.symbol.toUpperCase() === upper);
}

export function evaluateDecision(decision: Decision, facts: GuardrailFacts): Verdict {
  const { settings, mode } = facts;
  const risk = settings.risk;
  const now = facts.now ?? new Date();
  const codes: string[] = [];
  const messages: string[] = [];
  const notes: string[] = [];

  const block = (code: string, message: string) => {
    codes.push(code);
    messages.push(message);
  };
  const note = (message: string) => {
    notes.push(message);
  };

  const symbol = decision.symbol.toUpperCase().trim();

  if (decision.action === "hold") {
    return { allow: true, codes, messages, plan: null };
  }

  if (!risk.allowedSymbols.map((s) => s.toUpperCase()).includes(symbol)) {
    block("symbol_not_allowed", `${symbol} is not in the allowed symbol list`);
  }

  if (mode === "live" && !facts.liveGate.ok) {
    block("live_gate_closed", facts.liveGate.reason ?? "live trading is not enabled");
  }

  if (facts.cyclesToday >= risk.maxCyclesPerDay) {
    block(
      "cycle_limit_reached",
      `${facts.cyclesToday} cycles already run today (limit ${risk.maxCyclesPerDay})`,
    );
  }

  // Per-symbol cooldown: a BTC entry must not be blocked by an ETH order.
  const lastOrder = facts.lastOrderFor(symbol);
  if (lastOrder) {
    const elapsed = (now.getTime() - new Date(lastOrder).getTime()) / 1000;
    if (elapsed < risk.cooldownSeconds) {
      block(
        "cooldown_active",
        `last ${symbol} order was ${Math.round(elapsed)}s ago, cooldown is ${risk.cooldownSeconds}s`,
      );
    }
  }

  if (facts.dailyPnlChange <= -risk.dailyLossLimitUsd) {
    block(
      "daily_loss_limit",
      `daily PnL change ${facts.dailyPnlChange.toFixed(2)} hit the -$${risk.dailyLossLimitUsd} limit`,
    );
  }

  if (symbol.includes("/")) {
    block("perp_only", "spot pairs are not tradable by the agent");
  }

  if (decision.confidence < risk.minConfidence) {
    block(
      "low_confidence",
      `confidence ${decision.confidence.toFixed(2)} is below the ${risk.minConfidence} threshold`,
    );
  }

  const market = symbolSnapshot(facts.snapshot, symbol);
  if (!market || market.markPrice <= 0) {
    block("market_unavailable", `no live price for ${symbol} in this snapshot`);
    return { allow: false, codes, messages, plan: null };
  }

  if (mode === "live" && decision.order_type === "ioc") {
    block("ioc_not_supported_live", "the live engine only submits market orders");
  }

  if (decision.order_type === "ioc" && (decision.limit_price ?? 0) <= 0) {
    block("missing_limit_price", "an ioc order requires limit_price");
  }

  const existing = positionFor(facts.snapshot.positions, symbol);

  if (decision.action === "close") {
    if (!existing) {
      block("no_position_to_close", `there is no open ${symbol} position to close`);
      return { allow: false, codes, messages, plan: null };
    }
    const amount = roundDown(existing.size, market.precision.sizeDecimals);
    if (amount <= 0) {
      block("amount_rounds_to_zero", `position size ${existing.size} rounds to zero at the market's precision`);
      return { allow: false, codes, messages, plan: null };
    }
    return {
      allow: codes.length === 0,
      codes,
      messages: [...messages, ...notes],
      plan: {
        kind: "close",
        symbol,
        side: existing.side === "long" ? "short" : "long",
        amount,
        notionalUsd: amount * market.markPrice,
        orderType: "market",
        limitPrice: null,
        reduceOnly: true,
        priceDecimals: market.precision.priceDecimals,
        sizeDecimals: market.precision.sizeDecimals,
        markPrice: market.markPrice,
      },
    };
  }

  // action === "open"
  if (!decision.side) {
    block("missing_side", "an open decision requires side");
  }

  if (decision.size_usd <= 0) {
    block("zero_size", "size_usd must be greater than zero");
  }

  if (existing && existing.side === decision.side) {
    note(`already ${existing.side} ${symbol}; this order increases the position`);
  }

  const openSymbols = new Set(facts.snapshot.positions.map((p) => p.symbol.toUpperCase()));
  if (!existing && openSymbols.size >= risk.maxOpenPositions) {
    block(
      "max_positions_reached",
      `${openSymbols.size} positions are already open (limit ${risk.maxOpenPositions})`,
    );
  }

  let sizeUsd = decision.size_usd;
  if (sizeUsd > risk.maxNotionalUsd) {
    note(`size clamped from $${sizeUsd.toFixed(2)} to the $${risk.maxNotionalUsd} per-order cap`);
    sizeUsd = risk.maxNotionalUsd;
  }

  const amount = roundDown(sizeUsd / market.markPrice, market.precision.sizeDecimals);
  const notionalUsd = amount * market.markPrice;

  if (amount <= 0 || notionalUsd < market.precision.minQuoteAmount) {
    block(
      "below_min_notional",
      `$${notionalUsd.toFixed(2)} is under the ${symbol} minimum of $${market.precision.minQuoteAmount}`,
    );
  } else if (amount < market.precision.minBaseAmount) {
    block(
      "below_min_base",
      `${amount} ${symbol} is under the minimum base amount ${market.precision.minBaseAmount}`,
    );
  }

  const equity = facts.snapshot.account?.equity ?? 0;
  if (equity > 0) {
    const otherNotional = facts.snapshot.positions
      .filter((p) => p.symbol.toUpperCase() !== symbol)
      .reduce((sum, p) => sum + p.notionalUsd, 0);
    const projected = (otherNotional + notionalUsd) / equity;
    if (projected > risk.maxLeverage) {
      block(
        "leverage_exceeded",
        `projected account leverage ${projected.toFixed(2)}x exceeds the ${risk.maxLeverage}x limit`,
      );
    }
  }

  return {
    allow: codes.length === 0,
    codes,
    messages: [...messages, ...notes],
    plan:
      codes.length === 0
        ? {
            kind: "open",
            symbol,
            side: decision.side ?? "long",
            amount,
            notionalUsd,
            orderType: decision.order_type,
            limitPrice: decision.order_type === "ioc" ? decision.limit_price : null,
            reduceOnly: false,
            priceDecimals: market.precision.priceDecimals,
            sizeDecimals: market.precision.sizeDecimals,
            markPrice: market.markPrice,
          }
        : null,
  };
}
