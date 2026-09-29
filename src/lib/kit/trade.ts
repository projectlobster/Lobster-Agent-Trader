import { runKit, type RunKitOptions } from "./run";
import type {
  TradeCloseAllPreview,
  TradeCloseAllResult,
  TradeSubmitResponse,
} from "./types";

export type TradeCallOptions = Pick<RunKitOptions, "timeoutMs"> & { host?: string };

function options(opts?: TradeCallOptions): RunKitOptions {
  return {
    timeoutMs: opts?.timeoutMs,
    extraEnv: opts?.host ? { LIGHTER_HOST: opts.host } : undefined,
  };
}

export type TradeSide = "buy" | "sell" | "long" | "short";

export function orderMarket(
  args: { symbol: string; side: TradeSide; amount: number; slippage?: number; reduceOnly?: boolean },
  opts?: TradeCallOptions,
) {
  const argv = [
    "order",
    "market",
    args.symbol,
    "--side",
    args.side,
    "--amount",
    String(args.amount),
  ];
  if (args.slippage !== undefined) argv.push("--slippage", String(args.slippage));
  if (args.reduceOnly) argv.push("--reduce_only");
  return runKit<TradeSubmitResponse>("trade", argv, options(opts));
}

export function orderLimit(
  args: {
    symbol: string;
    side: TradeSide;
    amount: number;
    price: number;
    reduceOnly?: boolean;
    postOnly?: boolean;
  },
  opts?: TradeCallOptions,
) {
  const argv = [
    "order",
    "limit",
    args.symbol,
    "--side",
    args.side,
    "--amount",
    String(args.amount),
    "--price",
    String(args.price),
  ];
  if (args.reduceOnly) argv.push("--reduce_only");
  if (args.postOnly) argv.push("--post_only");
  return runKit<TradeSubmitResponse>("trade", argv, options(opts));
}

export function orderCancelAll(opts?: TradeCallOptions) {
  return runKit<TradeSubmitResponse>("trade", ["order", "cancel_all"], options(opts));
}

export function closeAllPreview(opts?: TradeCallOptions) {
  return runKit<TradeCloseAllPreview>("trade", ["order", "close_all", "--preview"], options(opts));
}

export function closeAll(args: { slippage?: number } = {}, opts?: TradeCallOptions) {
  const argv = ["order", "close_all"];
  if (args.slippage !== undefined) argv.push("--slippage", String(args.slippage));
  return runKit<TradeCloseAllResult>("trade", argv, options(opts));
}

export function positionLeverage(
  args: { symbol: string; leverage: number; marginMode?: "cross" | "isolated" },
  opts?: TradeCallOptions,
) {
  const argv = ["position", "leverage", args.symbol, "--leverage", String(args.leverage)];
  if (args.marginMode) argv.push("--margin_mode", args.marginMode);
  return runKit<TradeSubmitResponse>("trade", argv, options(opts));
}
