import type { Settings, TradingMode } from "@/lib/store/settings";
import { decisionSchemaForPrompt } from "./schema";
import { renderSnapshot, type MarketSnapshot } from "./snapshot";

export type BudgetLine = {
  allowanceTokens: number;
  usedTokens: number;
  remainingTokens: number;
  minCycleTokens: number;
};

export function formatTokens(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function renderBudgetLine(budget: BudgetLine): string {
  const pct = budget.allowanceTokens > 0 ? ((budget.usedTokens / budget.allowanceTokens) * 100).toFixed(1) : "0.0";
  return (
    `allowance ${formatTokens(budget.allowanceTokens)} tok · used ${formatTokens(budget.usedTokens)} (${pct}%) · ` +
    `remaining ${formatTokens(budget.remainingTokens)} · min cycle ${formatTokens(budget.minCycleTokens)}`
  );
}

export function buildSystemPrompt(settings: Settings, mode: TradingMode): string {
  const { risk, agent } = settings;
  const sizingRule =
    mode === "live"
      ? "Only `market` orders are accepted while trading live; an `ioc` decision is rejected."
      : "Both `market` and `ioc` are accepted on the paper account. `ioc` additionally requires `limit_price`.";

  return [
    "You are the decision layer of an automated perpetual-futures trading agent on the Lighter DEX.",
    "",
    "OUTPUT CONTRACT",
    "- Reply with exactly one JSON object and nothing else. No prose, no markdown fences, no explanation outside the object.",
    "- Every field in the schema is required. Use null for a field that does not apply.",
    "- `thesis` and `invalidation` must be written in English. Everything else stays in English too.",
    "",
    "SCHEMA",
    decisionSchemaForPrompt(),
    "",
    "TRADING RULES",
    `- You may only trade these perpetual markets: ${risk.allowedSymbols.join(", ")}.`,
    `- Maximum notional per order: $${risk.maxNotionalUsd}. Orders are clamped to this; a smaller size is preferred when the edge is marginal.`,
    `- Maximum account leverage: ${risk.maxLeverage}x. At most ${risk.maxOpenPositions} positions may be open at once.`,
    `- A decision whose \`confidence\` is below ${risk.minConfidence} is discarded by the risk layer. Express weak ideas as \`hold\` instead.`,
    `- \`close\` requires an open position in that symbol; it closes the whole position.`,
    `- \`hold\` is a legitimate and frequently correct answer. Say so plainly and explain what you are waiting for.`,
    "- Never invent prices. Use only the numbers in the snapshot.",
    `- ${sizingRule}`,
    "",
    "DISCIPLINE",
    "- Funding is an ongoing cost on every held position. A position only deserves to stay open if the thesis still holds after funding.",
    "- Size from conviction and from the liquidity you can actually see in the depth numbers, not from how exciting the idea feels.",
    "- Do not propose a trade whose invalidation you cannot state concretely.",
    `- Horizon choices: ${agent.watchlist.length > 0 ? "intraday or swing" : "intraday or swing"}.`,
  ].join("\n");
}

export function buildUserPrompt(args: {
  snapshot: MarketSnapshot;
  budget: BudgetLine;
  cycleNumber: number;
  mode: TradingMode;
}): string {
  const { snapshot, budget, cycleNumber, mode } = args;
  return [
    renderSnapshot(snapshot, renderBudgetLine(budget)),
    "",
    `CYCLE ${cycleNumber} · mode=${mode}`,
    // Restated last on purpose: cheap models follow instructions that sit right
    // before the answer far more reliably than ones buried in the system prompt.
    "Reply with exactly one JSON object and nothing else — no prose, no markdown fences.",
    "`thesis` and `invalidation` must be plain English sentences.",
  ].join("\n");
}

export function buildRepairPrompt(previousText: string, error: string): string {
  return [
    "Your previous reply could not be parsed.",
    "",
    `ERROR: ${error}`,
    "",
    "PREVIOUS REPLY:",
    previousText.slice(0, 2000),
    "",
    "Reply again with exactly one valid JSON object matching the schema. No prose, no markdown fences.",
  ].join("\n");
}
