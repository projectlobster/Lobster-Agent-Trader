import { ENV_KEY, type LlmProvider, type ReasoningEffort } from "@/lib/llm/types";
import { getOne, run } from "./db";

export type { LlmProvider, ReasoningEffort };

export type TradingMode = "paper" | "live";

export type Settings = {
  llm: {
    provider: LlmProvider;
    model: string;
    apiKey: string;
    maxOutputTokens: number;
    reasoningEffort: ReasoningEffort;
    jsonMode: boolean;
  };
  budget: {
    monthlyTokens: number;
    reservedForWork: number;
    carryOverLeftover: boolean;
    resetDay: number;
  };
  kit: {
    host: string;
    paperStatePath: string;
    python: string;
  };
  agent: {
    watchlist: string[];
    intervalSeconds: number;
    candleResolution: string;
    candleCountBack: number;
    bookDepth: number;
  };
  risk: {
    allowedSymbols: string[];
    maxNotionalUsd: number;
    maxLeverage: number;
    maxOpenPositions: number;
    maxCyclesPerDay: number;
    cooldownSeconds: number;
    minConfidence: number;
    dailyLossLimitUsd: number;
  };
  paper: {
    initialCollateral: number;
    tier: string;
  };
  mode: TradingMode;
  liveEnabled: boolean;
};

export const HOSTS: Array<{ id: string; label: string; url: string }> = [
  { id: "lighter-mainnet", label: "Lighter mainnet", url: "https://mainnet.zklighter.elliot.ai" },
  { id: "lighter-testnet", label: "Lighter testnet", url: "https://testnet.zklighter.elliot.ai" },
  { id: "robinhood-mainnet", label: "Robinhood Lighter", url: "https://api.rh.lighter.xyz" },
  {
    id: "robinhood-testnet",
    label: "Robinhood Lighter testnet",
    url: "https://api.rh-testnet.lighter.xyz",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  llm: {
    provider: "openrouter",
    model: "inclusionai/ling-3.0-flash-sante:free",
    apiKey: "",
    // Reasoning models spend output budget on thinking before they answer, so a
    // tight limit produces finish_reason "length" with an empty message. 6000 was
    // observed to be exceeded; the budget estimator uses the learned average, so
    // this ceiling is a safety net rather than the expected cost.
    maxOutputTokens: 8_000,
    reasoningEffort: "low",
    // Off by default: many OpenRouter free endpoints reject
    // `response_format: {type:"json_object"}` with HTTP 400. The prompt already
    // demands a bare JSON object, and zod validation plus the repair retry cover
    // the rest. Worth turning on for models known to support it.
    jsonMode: false,
  },
  budget: {
    monthlyTokens: 6_000_000,
    reservedForWork: 5_000_000,
    carryOverLeftover: true,
    resetDay: 1,
  },
  kit: {
    host: "https://mainnet.zklighter.elliot.ai",
    paperStatePath: "./data/paper-state.json",
    python: "",
  },
  agent: {
    watchlist: ["BTC", "ETH", "SOL"],
    intervalSeconds: 300,
    candleResolution: "15m",
    candleCountBack: 24,
    bookDepth: 5,
  },
  risk: {
    allowedSymbols: ["BTC", "ETH", "SOL"],
    maxNotionalUsd: 250,
    maxLeverage: 3,
    maxOpenPositions: 3,
    maxCyclesPerDay: 48,
    cooldownSeconds: 300,
    minConfidence: 0.55,
    dailyLossLimitUsd: 20,
  },
  paper: {
    initialCollateral: 10_000,
    tier: "premium",
  },
  mode: "paper",
  liveEnabled: false,
};

const KEY = "settings";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  const out: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    const current = out[k];
    out[k] = isPlainObject(v) && isPlainObject(current) ? merge(current, v) : v;
  }
  return out as unknown as T;
}

export function readSettings(): Settings {
  const row = getOne<{ v: string }>("SELECT v FROM settings WHERE k = ?", KEY);
  if (!row) return applyEnvOverrides(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(row.v) as unknown;
    // Live trading can never be enabled by the persisted flag alone; the API
    // layer gates it behind an env var and an explicit confirmation.
    return applyEnvOverrides(merge(DEFAULT_SETTINGS, parsed));
  } catch {
    return applyEnvOverrides(DEFAULT_SETTINGS);
  }
}

export function writeSettings(patch: unknown): Settings {
  const next = merge(readSettings(), patch);
  run(
    "INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    KEY,
    JSON.stringify(next),
  );
  return next;
}

export function publicSettings(settings: Settings) {
  return {
    ...settings,
    llm: {
      ...settings.llm,
      apiKey: "",
      apiKeySet:
        settings.llm.apiKey.trim().length > 0 ||
        Boolean(providerKeyFromEnv(settings.llm.provider)),
    },
    kit: {
      ...settings.kit,
      python: settings.kit.python || "python3",
    },
  };
}

export function providerKeyFromEnv(provider: LlmProvider): string | undefined {
  return process.env[ENV_KEY[provider]];
}

/** The key for one specific provider — never substitute another provider's key. */
export function apiKeyForProvider(
  settings: Settings,
  provider: LlmProvider,
): string | undefined {
  const envKey = providerKeyFromEnv(provider);
  if (envKey && envKey.trim().length > 0) return envKey.trim();
  // The stored key belongs to the configured provider only.
  if (settings.llm.provider !== provider) return undefined;
  const stored = settings.llm.apiKey.trim();
  return stored.length > 0 ? stored : undefined;
}

export function resolveApiKey(settings: Settings): string | undefined {
  return apiKeyForProvider(settings, settings.llm.provider);
}

function parseEnvProvider(): LlmProvider | undefined {
  const value = process.env.LIGHTER_TRADER_LLM_PROVIDER;
  return value === "anthropic" || value === "openai" || value === "openrouter" ? value : undefined;
}

function parseEnvReasoning(): ReasoningEffort | undefined {
  const value = process.env.LIGHTER_TRADER_LLM_REASONING;
  return value === "off" || value === "low" || value === "medium" || value === "high"
    ? value
    : undefined;
}

/** Which LLM fields the environment pins, so the UI can say so instead of lying. */
export function envPinnedFields(): Array<"provider" | "model" | "reasoningEffort"> {
  const pinned: Array<"provider" | "model" | "reasoningEffort"> = [];
  if (parseEnvProvider()) pinned.push("provider");
  if (process.env.LIGHTER_TRADER_LLM_MODEL?.trim()) pinned.push("model");
  if (parseEnvReasoning()) pinned.push("reasoningEffort");
  return pinned;
}

/**
 * Environment overrides win over stored settings, matching the documented
 * precedence for credentials. Applied on read so a change to .env.local takes
 * effect without a migration.
 */
function applyEnvOverrides(settings: Settings): Settings {
  const provider = parseEnvProvider();
  const model = process.env.LIGHTER_TRADER_LLM_MODEL?.trim();
  const reasoningEffort = parseEnvReasoning();
  if (!provider && !model && !reasoningEffort) return settings;

  return {
    ...settings,
    llm: {
      ...settings.llm,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    },
  };
}
