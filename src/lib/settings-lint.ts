import type { Settings } from "@/lib/store/settings";

/**
 * Configuration smells that are legal but almost never intended. Returned by the
 * settings API and rendered on the Settings page, because every one of these
 * silently wastes either tokens or a blocked run.
 */
export function lintSettings(settings: Settings): string[] {
  const warnings: string[] = [];

  const allowed = new Set(settings.risk.allowedSymbols.map((s) => s.toUpperCase()));
  const outside = settings.agent.watchlist
    .map((s) => s.toUpperCase())
    .filter((symbol) => !allowed.has(symbol));
  if (outside.length > 0) {
    warnings.push(
      `${outside.join(", ")} on the watchlist is missing from the allowed symbols: the model will see it but every order for it will be refused by the risk layer.`,
    );
  }

  const allowance = settings.budget.monthlyTokens - settings.budget.reservedForWork;
  if (allowance < 0) {
    warnings.push(
      `The reserved amount (${settings.budget.reservedForWork}) exceeds the monthly budget (${settings.budget.monthlyTokens}), so the tradable allowance is treated as zero.`,
    );
  } else if (allowance === 0) {
    warnings.push("The tradable allowance is zero, so the trader has nothing to spend.");
  }

  if (settings.risk.minConfidence > 0.85) {
    warnings.push(
      "Minimum confidence is above 0.85, so almost every decision will be discarded and become a hold.",
    );
  }
  if (settings.agent.watchlist.length === 0) {
    warnings.push("The watchlist is empty, so the model receives no market data at all.");
  }
  if (settings.risk.maxNotionalUsd < 10) {
    warnings.push(
      "The per-order notional cap is under $10, but most perp markets have a minimum order around $10, so orders will be refused for being under the minimum.",
    );
  }
  if (settings.liveEnabled && settings.mode === "paper") {
    warnings.push(
      "The live switch is on but the engine is still running in paper mode, so no order reaches Lighter.",
    );
  }

  return warnings;
}
