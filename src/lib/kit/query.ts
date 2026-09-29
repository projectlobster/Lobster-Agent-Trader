import { KIT_TTL_MS, cacheKey, cached } from "./cache";
import { runKit, type RunKitOptions } from "./run";
import type {
  AccountInfoResponse,
  AuthStatus,
  CandlesResponse,
  ExchangeStatsResponse,
  FundingResponse,
  HealthResponse,
  MarketBookResponse,
  MarketInfoResponse,
  MarketListResponse,
  MarketType,
  OrdersResponse,
} from "./types";

export type KitCallOptions = Pick<RunKitOptions, "timeoutMs"> & { host?: string };

function options(opts?: KitCallOptions): RunKitOptions {
  return {
    timeoutMs: opts?.timeoutMs,
    extraEnv: opts?.host ? { LIGHTER_HOST: opts.host } : undefined,
  };
}

export function health(opts?: KitCallOptions) {
  return runKit<HealthResponse>("health", [], options(opts));
}

export function authStatus(opts?: KitCallOptions) {
  return runKit<AuthStatus>("query", ["auth", "status"], options(opts));
}

export function systemStatus(opts?: KitCallOptions) {
  return runKit<Record<string, unknown>>("query", ["system", "status"], options(opts));
}

export function marketList(
  args: { marketType?: MarketType; search?: string } = {},
  opts?: KitCallOptions,
) {
  const argv = ["market", "list"];
  if (args.marketType) argv.push("--market_type", args.marketType);
  if (args.search) argv.push("--search", args.search);
  return runKit<MarketListResponse>("query", argv, options(opts));
}

export function marketInfo(
  args: { symbol?: string; marketType?: MarketType } = {},
  opts?: KitCallOptions,
) {
  const argv = ["market", "info"];
  if (args.marketType) argv.push("--market_type", args.marketType);
  if (args.symbol) argv.push("--symbol", args.symbol);
  return cached(cacheKey(["query", ...argv, opts?.host]), KIT_TTL_MS.marketInfo, () =>
    runKit<MarketInfoResponse>("query", argv, options(opts)),
  );
}

export function marketBook(symbol: string, limit = 5, opts?: KitCallOptions) {
  return runKit<MarketBookResponse>(
    "query",
    ["market", "book", symbol, "--limit", String(limit)],
    options(opts),
  );
}

export function marketCandles(
  symbol: string,
  resolution: string,
  countBack: number,
  opts?: KitCallOptions,
) {
  const argv = [
    "market",
    "candles",
    symbol,
    "--resolution",
    resolution,
    "--count_back",
    String(countBack),
  ];
  return cached(cacheKey(["query", ...argv, opts?.host]), KIT_TTL_MS.marketCandles, () =>
    runKit<CandlesResponse>("query", argv, options(opts)),
  );
}

export function marketFunding(symbol?: string, opts?: KitCallOptions) {
  const argv = ["market", "funding"];
  if (symbol) argv.push("--symbol", symbol);
  return cached(cacheKey(["query", ...argv, opts?.host]), KIT_TTL_MS.marketFunding, () =>
    runKit<FundingResponse>("query", argv, options(opts)),
  );
}

export function marketStats(symbol?: string, opts?: KitCallOptions) {
  const argv = ["market", "stats"];
  if (symbol) argv.push("--symbol", symbol);
  return cached(cacheKey(["query", ...argv, opts?.host]), KIT_TTL_MS.marketStats, () =>
    runKit<ExchangeStatsResponse>("query", argv, options(opts)),
  );
}

export function accountInfo(accountIndex: number | undefined, opts?: KitCallOptions) {
  const argv = ["account", "info"];
  if (accountIndex !== undefined) argv.push("--account_index", String(accountIndex));
  return runKit<AccountInfoResponse>("query", argv, options(opts));
}

export function ordersOpen(symbol: string, opts?: KitCallOptions) {
  return runKit<OrdersResponse>("query", ["orders", "open", "--symbol", symbol], options(opts));
}

export function portfolioPerformance(
  resolution: string,
  countBack: number,
  opts?: KitCallOptions,
) {
  return runKit<Record<string, unknown>>(
    "query",
    ["portfolio", "performance", "--resolution", resolution, "--count_back", String(countBack)],
    options(opts),
  );
}
