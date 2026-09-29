import { isAbsolute, resolve } from "node:path";
import { runKit, type RunKitOptions } from "./run";
import type {
  PaperHealthResponse,
  PaperInitResponse,
  PaperOrderResponse,
  PaperPositionsResponse,
  PaperStatusResponse,
  PaperTradesResponse,
} from "./types";

export type PaperCallOptions = Pick<RunKitOptions, "timeoutMs"> & {
  host?: string;
  statePath?: string;
};

// The kit scripts run with the kit directory as their cwd, so a relative
// LIGHTER_PAPER_STATE_PATH would resolve somewhere unexpected. Anchor it to
// the project root instead.
export function resolvePaperStatePath(input?: string): string | undefined {
  const value = input?.trim();
  if (!value) return undefined;
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

export function paperEnv(opts?: PaperCallOptions): Record<string, string | undefined> | undefined {
  const env: Record<string, string | undefined> = {};
  if (opts?.host) env.LIGHTER_HOST = opts.host;
  const statePath = resolvePaperStatePath(opts?.statePath);
  if (statePath) env.LIGHTER_PAPER_STATE_PATH = statePath;
  return Object.keys(env).length > 0 ? env : undefined;
}

function options(opts?: PaperCallOptions): RunKitOptions {
  return { timeoutMs: opts?.timeoutMs, extraEnv: paperEnv(opts) };
}

export type PaperSide = "buy" | "sell" | "long" | "short";

export function paperInit(args: { collateral?: number; tier?: string } = {}, opts?: PaperCallOptions) {
  const argv = ["init"];
  if (args.collateral !== undefined) argv.push("--collateral", String(args.collateral));
  if (args.tier) argv.push("--tier", args.tier);
  return runKit<PaperInitResponse>("paper", argv, options(opts));
}

export function paperReset(args: { collateral?: number; tier?: string } = {}, opts?: PaperCallOptions) {
  const argv = ["reset"];
  if (args.collateral !== undefined) argv.push("--collateral", String(args.collateral));
  if (args.tier) argv.push("--tier", args.tier);
  return runKit<PaperInitResponse>("paper", argv, options(opts));
}

export function paperStatus(args: { refresh?: boolean } = {}, opts?: PaperCallOptions) {
  const argv = ["status"];
  if (args.refresh === false) argv.push("--no-refresh");
  return runKit<PaperStatusResponse>("paper", argv, options(opts));
}

export function paperPositions(
  args: { symbol?: string; refresh?: boolean } = {},
  opts?: PaperCallOptions,
) {
  const argv = ["positions"];
  if (args.symbol) argv.push("--symbol", args.symbol);
  if (args.refresh === false) argv.push("--no-refresh");
  return runKit<PaperPositionsResponse>("paper", argv, options(opts));
}

export function paperTrades(args: { symbol?: string; limit?: number } = {}, opts?: PaperCallOptions) {
  const argv = ["trades"];
  if (args.symbol) argv.push("--symbol", args.symbol);
  if (args.limit !== undefined) argv.push("--limit", String(args.limit));
  return runKit<PaperTradesResponse>("paper", argv, options(opts));
}

export function paperHealth(args: { refresh?: boolean } = {}, opts?: PaperCallOptions) {
  const argv = ["health"];
  if (args.refresh === false) argv.push("--no-refresh");
  return runKit<PaperHealthResponse>("paper", argv, options(opts));
}

export function paperRefresh(symbol: string, opts?: PaperCallOptions) {
  return runKit<Record<string, unknown>>("paper", ["refresh", "--symbol", symbol], options(opts));
}

export function paperOrderMarket(
  args: { symbol: string; side: PaperSide; amount: number },
  opts?: PaperCallOptions,
) {
  return runKit<PaperOrderResponse>(
    "paper",
    [
      "order",
      "market",
      args.symbol,
      "--side",
      args.side,
      "--amount",
      String(args.amount),
    ],
    options(opts),
  );
}

export function paperOrderIoc(
  args: { symbol: string; side: PaperSide; amount: number; price: number },
  opts?: PaperCallOptions,
) {
  return runKit<PaperOrderResponse>(
    "paper",
    [
      "order",
      "ioc",
      args.symbol,
      "--side",
      args.side,
      "--amount",
      String(args.amount),
      "--price",
      String(args.price),
    ],
    options(opts),
  );
}
