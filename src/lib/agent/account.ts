import { findKitDir } from "@/lib/kit/locate";
import { paperHealth, paperPositions, paperStatus } from "@/lib/kit/paper";
import { accountInfo } from "@/lib/kit/query";
import type { Settings, TradingMode } from "@/lib/store/settings";

export type PositionView = {
  symbol: string;
  marketIndex: number | null;
  side: "long" | "short";
  size: number;
  avgEntryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  notionalUsd: number;
  liquidationPrice: number;
};

export type AccountSnapshot = {
  source: "paper" | "live";
  equity: number;
  collateral: number;
  unrealizedPnl: number;
  totalPnl: number;
  marginUsagePct: number | null;
  tier?: string;
};

export type AccountState = {
  account: AccountSnapshot | null;
  positions: PositionView[];
  warnings: string[];
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readAccountState(
  settings: Settings,
  mode: TradingMode,
  options: { refresh?: boolean } = {},
): Promise<AccountState> {
  const warnings: string[] = [];

  if (!findKitDir()) {
    return { account: null, positions: [], warnings: ["lighter-agent-kit is not installed"] };
  }

  const host = settings.kit.host || undefined;
  const refresh = options.refresh ?? true;
  const paperOptions = { host, statePath: settings.kit.paperStatePath || undefined };

  try {
    if (mode === "paper") {
      const [status, openPositions, health] = await Promise.all([
        paperStatus({ refresh }, paperOptions),
        paperPositions({ refresh }, paperOptions),
        paperHealth({ refresh }, paperOptions),
      ]);

      if (openPositions.warnings?.refresh_failed) {
        for (const [symbol, detail] of Object.entries(openPositions.warnings.refresh_failed)) {
          warnings.push(`${symbol}: mark refresh failed (${detail})`);
        }
      }

      return {
        account: {
          source: "paper",
          equity: status.collateral + status.unrealized_pnl,
          collateral: status.collateral,
          unrealizedPnl: status.unrealized_pnl,
          totalPnl: status.total_pnl,
          marginUsagePct: health.margin_usage ?? null,
          tier: status.tier,
        },
        positions: openPositions.positions.map((p) => ({
          symbol: p.symbol.toUpperCase(),
          marketIndex: p.market_id,
          side: p.side,
          size: Math.abs(p.size),
          avgEntryPrice: p.avg_entry_price,
          markPrice: p.mark_price,
          unrealizedPnl: p.unrealized_pnl,
          notionalUsd: Math.abs(p.size) * p.mark_price,
          liquidationPrice: p.liquidation_price,
        })),
        warnings,
      };
    }

    const info = await accountInfo(undefined, { host });
    const record = info.accounts?.[0];
    if (!record) {
      return { account: null, positions: [], warnings: ["no account returned for this credential"] };
    }

    const positions: PositionView[] = (record.positions ?? []).map((p) => {
      const size = Math.abs(toNumber(p.position));
      const value = Math.abs(toNumber(p.position_value));
      return {
        symbol: p.symbol.toUpperCase(),
        marketIndex: p.market_id,
        side: p.sign >= 0 ? "long" : "short",
        size,
        avgEntryPrice: toNumber(p.avg_entry_price),
        markPrice: size > 0 ? value / size : 0,
        unrealizedPnl: toNumber(p.unrealized_pnl),
        notionalUsd: value,
        liquidationPrice: toNumber(p.liquidation_price),
      };
    });

    const collateral = toNumber(record.collateral);
    const unrealized = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    return {
      account: {
        source: "live",
        equity: collateral + unrealized,
        collateral,
        unrealizedPnl: unrealized,
        totalPnl: unrealized,
        marginUsagePct: null,
      },
      positions,
      warnings,
    };
  } catch (error) {
    warnings.push(`account state unavailable: ${messageOf(error)}`);
    return { account: null, positions: [], warnings };
  }
}
