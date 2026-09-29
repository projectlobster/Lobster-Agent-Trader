import { readAccountState, type AccountSnapshot, type PositionView } from "@/lib/agent/account";
import { engineStatus } from "@/lib/agent/engine";
import { kitLocation } from "@/lib/kit/locate";
import { startOfLocalDayISO } from "@/lib/store/equity";
import { averageCycleCost } from "@/lib/store/llm";
import { listOrders, type OrderRecord } from "@/lib/store/orders";
import { allowanceOf, getOrCreatePeriod } from "@/lib/store/periods";
import {
  countRuns,
  listRuns,
  statusBreakdown,
  tokensByDay,
  tokensByModel,
  tokensUsedInPeriod,
  type RunRecord,
} from "@/lib/store/runs";
import { publicSettings, readSettings, type Settings } from "@/lib/store/settings";

export type Ledger = {
  periodKey: string;
  resetDay: number;
  budgetTokens: number;
  reservedTokens: number;
  carryInTokens: number;
  allowanceTokens: number;
  usedTokens: number;
  remainingTokens: number;
  utilization: number;
  carryOver: boolean;
  cyclesToday: number;
  averageCycleTokens: number;
  averageCycleCostUsd: number;
  pnlPerMillionTokens: number | null;
  byDay: Array<{ day: string; tokens: number; cost_usd: number; runs: number }>;
  byModel: Array<{
    model: string;
    provider: string;
    tokens: number;
    cost_usd: number;
    calls: number;
  }>;
  statuses: Array<{ status: string; n: number }>;
};

export type Overview = {
  settings: ReturnType<typeof publicSettings>;
  ledger: Ledger;
  account: AccountSnapshot | null;
  positions: PositionView[];
  warnings: string[];
  runs: RunRecord[];
  orders: OrderRecord[];
  engine: ReturnType<typeof engineStatus>;
  kit: ReturnType<typeof kitLocation>;
};

export function buildLedger(settings: Settings, account: AccountSnapshot | null): Ledger {
  const period = getOrCreatePeriod(settings);
  const allowance = allowanceOf(period);
  const used = tokensUsedInPeriod(period.period_key);
  const averages = averageCycleCost();
  const totalPnl = account?.totalPnl ?? null;

  return {
    periodKey: period.period_key,
    resetDay: settings.budget.resetDay,
    budgetTokens: period.budget_tokens,
    reservedTokens: period.reserved_tokens,
    carryInTokens: period.carry_in_tokens,
    allowanceTokens: allowance,
    usedTokens: used,
    remainingTokens: Math.max(allowance - used, 0),
    utilization: allowance > 0 ? used / allowance : 0,
    carryOver: settings.budget.carryOverLeftover,
    cyclesToday: countRuns({ since: startOfLocalDayISO() }),
    averageCycleTokens: averages.tokens,
    averageCycleCostUsd: averages.costUsd,
    pnlPerMillionTokens:
      totalPnl === null || used === 0 ? null : totalPnl / (used / 1_000_000),
    byDay: tokensByDay(period.period_key, 30).reverse(),
    byModel: tokensByModel(period.period_key),
    statuses: statusBreakdown(period.period_key),
  };
}

export async function getOverview(options: { runLimit?: number } = {}): Promise<Overview> {
  const settings = readSettings();
  const mode = engineStatus().mode;
  // Refresh marks: without it paper.py reports unrealized PnL as of the last
  // fill or refresh, so a position held for hours would show a stale (often
  // near-zero) PnL on the dashboard while the agent reasons from fresh marks.
  const accountState = await readAccountState(settings, mode, { refresh: true });

  return {
    settings: publicSettings(settings),
    ledger: buildLedger(settings, accountState.account),
    account: accountState.account,
    positions: accountState.positions,
    warnings: accountState.warnings,
    runs: listRuns({ limit: options.runLimit ?? 12 }),
    orders: listOrders(8),
    engine: engineStatus(),
    kit: kitLocation(),
  };
}
