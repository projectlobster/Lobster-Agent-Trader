import {
  marketBook,
  marketCandles,
  marketFunding,
  marketInfo,
  marketStats,
} from "@/lib/kit/query";
import type { Settings, TradingMode } from "@/lib/store/settings";
import { readAccountState, type AccountSnapshot, type PositionView } from "./account";

export type { AccountSnapshot, PositionView } from "./account";

export type SymbolPrecision = {
  sizeDecimals: number;
  priceDecimals: number;
  minBaseAmount: number;
  minQuoteAmount: number;
};

export type SymbolSnapshot = {
  symbol: string;
  marketIndex: number;
  markPrice: number;
  bestBid: number;
  bestAsk: number;
  spreadBps: number;
  bidDepthUsd: number;
  askDepthUsd: number;
  change24hPct: number | null;
  volume24hUsd: number | null;
  openInterestUsd: number | null;
  funding8hPct: number | null;
  fundingAnnualizedPct: number | null;
  fundingByExchange: Array<{ exchange: string; rate: number }>;
  closes: number[];
  candleResolution: string;
  precision: SymbolPrecision;
};

export type MarketSnapshot = {
  generatedAt: string;
  mode: TradingMode;
  host: string;
  symbols: SymbolSnapshot[];
  positions: PositionView[];
  account: AccountSnapshot | null;
  warnings: string[];
};

export type FundingPick = {
  representative: { exchange: string; rate: number } | null;
  annualizedPct: number | null;
  byExchange: Array<{ exchange: string; rate: number }>;
};

/**
 * Pick the funding rate that actually applies to a Lighter position.
 *
 * Cross-venue rates can disagree on *sign*: at review time SOL showed -0.0021%
 * on Binance (shorts paid) and +0.0064% on Lighter (longs paid), so preferring
 * Binance would invert the carry signal the model trades on. The API publishes
 * an 8-hour-equivalent rate, hence 3 periods a day.
 */
export function selectFundingRate(
  rows: Array<{ exchange: string; rate: number }>,
): FundingPick {
  const byExchange = rows.slice(0, 4);
  const representative =
    rows.find((r) => r.exchange.toLowerCase() === "lighter") ??
    rows.find((r) => r.exchange.toLowerCase() === "binance") ??
    rows[0] ??
    null;
  const funding8hPct = representative ? representative.rate * 100 : null;
  return {
    representative,
    byExchange,
    annualizedPct: funding8hPct === null ? null : funding8hPct * 3 * 365,
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const n = toNumber(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function mid(bestBid: number, bestAsk: number): number {
  if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
  return bestBid > 0 ? bestBid : bestAsk;
}

function depthUsd(levels: Array<{ price: string; remaining_base_amount: string }>): number {
  let total = 0;
  for (const level of levels) {
    total += toNumber(level.price) * toNumber(level.remaining_base_amount);
  }
  return total;
}

export async function buildSnapshot(
  settings: Settings,
  mode: TradingMode,
): Promise<MarketSnapshot> {
  const host = settings.kit.host || undefined;
  const kitOptions = { host };
  const watchlist = settings.agent.watchlist.map((s) => s.toUpperCase());
  const warnings: string[] = [];

  const [infoResult, statsResult, fundingResult] = await Promise.allSettled([
    marketInfo({ marketType: "perp" }, kitOptions),
    marketStats(undefined, kitOptions),
    marketFunding(undefined, kitOptions),
  ]);

  const infoRows =
    infoResult.status === "fulfilled"
      ? infoResult.value.order_books.filter((row) =>
          watchlist.includes(row.symbol.toUpperCase()),
        )
      : [];
  if (infoResult.status === "rejected") {
    warnings.push(`market info unavailable: ${String(infoResult.reason)}`);
  }

  const statsRows =
    statsResult.status === "fulfilled" ? (statsResult.value.order_book_stats ?? []) : [];
  if (statsResult.status === "rejected") {
    warnings.push(`market stats unavailable: ${String(statsResult.reason)}`);
  }

  const fundingRows =
    fundingResult.status === "fulfilled" ? (fundingResult.value.funding_rates ?? []) : [];
  if (fundingResult.status === "rejected") {
    warnings.push(`funding unavailable: ${String(fundingResult.reason)}`);
  }

  const perSymbol = await Promise.all(
    infoRows.map(async (row): Promise<SymbolSnapshot | null> => {
      const symbol = row.symbol.toUpperCase();
      const [bookResult, candlesResult] = await Promise.allSettled([
        marketBook(symbol, settings.agent.bookDepth, kitOptions),
        marketCandles(
          symbol,
          settings.agent.candleResolution,
          settings.agent.candleCountBack,
          kitOptions,
        ),
      ]);

      if (bookResult.status === "rejected") {
        warnings.push(`${symbol}: order book unavailable (${String(bookResult.reason)})`);
        return null;
      }

      const book = bookResult.value;
      const bestBid = toNumber(book.bids?.[0]?.price);
      const bestAsk = toNumber(book.asks?.[0]?.price);
      const markPrice = mid(bestBid, bestAsk);
      const spreadBps =
        markPrice > 0 && bestAsk > 0 && bestBid > 0
          ? ((bestAsk - bestBid) / markPrice) * 10_000
          : 0;

      const statsRow =
        statsRows.find((r) => String(r.symbol ?? "").toUpperCase() === symbol) ?? {};
      const change24hPct = pickNumber(statsRow, [
        "daily_price_change",
        "daily_price_change_percent",
        "price_change_percent",
      ]);
      const volume24hUsd = pickNumber(statsRow, [
        "daily_quote_token_volume",
        "daily_usd_volume",
        "daily_volume",
      ]);

      const rates = fundingRows
        .filter((r) => (r.symbol ?? "").toUpperCase() === symbol)
        .map((r) => ({ exchange: r.exchange, rate: r.rate }));
      const funding = selectFundingRate(rates);

      const closes =
        candlesResult.status === "fulfilled"
          ? (candlesResult.value.c ?? []).map((candle) => candle.c)
          : [];
      if (candlesResult.status === "rejected") {
        warnings.push(`${symbol}: candles unavailable (${String(candlesResult.reason)})`);
      }

      const openInterestBase = toNumber(row.open_interest ?? 0);

      return {
        symbol,
        marketIndex: row.market_id,
        markPrice,
        bestBid,
        bestAsk,
        spreadBps,
        bidDepthUsd: depthUsd(book.bids ?? []),
        askDepthUsd: depthUsd(book.asks ?? []),
        change24hPct,
        volume24hUsd,
        openInterestUsd: openInterestBase > 0 && markPrice > 0 ? openInterestBase * markPrice : null,
        funding8hPct: funding.representative ? funding.representative.rate * 100 : null,
        fundingAnnualizedPct: funding.annualizedPct,
        fundingByExchange: funding.byExchange,
        closes,
        candleResolution: settings.agent.candleResolution,
        precision: {
          sizeDecimals: row.supported_size_decimals,
          priceDecimals: row.supported_price_decimals,
          minBaseAmount: toNumber(row.min_base_amount),
          minQuoteAmount: toNumber(row.min_quote_amount),
        },
      };
    }),
  );

  const symbols = perSymbol.filter((s): s is SymbolSnapshot => s !== null);

  const accountState = await readAccountState(settings, mode, { refresh: true });
  warnings.push(...accountState.warnings);

  return {
    generatedAt: new Date().toISOString(),
    mode,
    host: settings.kit.host,
    symbols,
    positions: accountState.positions,
    account: accountState.account,
    warnings,
  };
}

function money(value: number, digits = 2): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(digits)}`;
}

export function renderSnapshot(snapshot: MarketSnapshot, budgetLine?: string): string {
  const lines: string[] = [];
  lines.push(
    `MARKET SNAPSHOT  ${snapshot.generatedAt}  mode=${snapshot.mode}  host=${snapshot.host}`,
  );
  lines.push("");

  for (const s of snapshot.symbols) {
    const change = s.change24hPct === null ? "n/a" : `${s.change24hPct.toFixed(2)}%`;
    lines.push(
      `[${s.symbol}] idx ${s.marketIndex}  mark ${s.markPrice}  bid ${s.bestBid} ask ${s.bestAsk}  ` +
        `spread ${s.spreadBps.toFixed(2)}bps  24h ${change}  vol24h ${money(s.volume24hUsd ?? 0)}`,
    );
    if (s.funding8hPct !== null) {
      const byExchange = s.fundingByExchange
        .map((r) => `${r.exchange} ${(r.rate * 100).toFixed(4)}%`)
        .join(" / ");
      lines.push(
        `  funding(8h): ${byExchange}   annualized ${(s.fundingAnnualizedPct ?? 0).toFixed(1)}%`,
      );
    }
    if (s.openInterestUsd !== null) {
      lines.push(`  open interest ${money(s.openInterestUsd)}`);
    }
    if (s.closes.length > 0) {
      lines.push(
        `  closes ${s.candleResolution} x${s.closes.length}: ${s.closes.map((c) => c.toFixed(1)).join(",")}`,
      );
    }
    lines.push(
      `  depth: bid ${money(s.bidDepthUsd)} / ask ${money(s.askDepthUsd)}`,
    );
    lines.push(
      `  limits: size ${s.precision.sizeDecimals}dp, price ${s.precision.priceDecimals}dp, ` +
        `min base ${s.precision.minBaseAmount}, min quote ${s.precision.minQuoteAmount}`,
    );
  }

  lines.push("");
  if (snapshot.positions.length === 0) {
    lines.push("POSITIONS  none");
  } else {
    lines.push(`POSITIONS (${snapshot.positions.length})`);
    for (const p of snapshot.positions) {
      lines.push(
        `  ${p.symbol} ${p.side} size=${p.size} entry=${p.avgEntryPrice} mark=${p.markPrice} ` +
          `uPnL=${money(p.unrealizedPnl)} notional=${money(p.notionalUsd)} liq=${p.liquidationPrice}`,
      );
    }
  }

  if (snapshot.account) {
    const a = snapshot.account;
    lines.push("");
    lines.push(
      `ACCOUNT (${a.source})  equity ${money(a.equity)}  collateral ${money(a.collateral)}  ` +
        `uPnL ${money(a.unrealizedPnl)}  totalPnL ${money(a.totalPnl)}` +
        (a.marginUsagePct === null ? "" : `  margin ${a.marginUsagePct.toFixed(2)}%`),
    );
  }

  if (budgetLine) {
    lines.push(`BUDGET  ${budgetLine}`);
  }

  if (snapshot.warnings.length > 0) {
    lines.push("");
    lines.push(`WARNINGS\n${snapshot.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }

  return lines.join("\n");
}
