import type { LlmProvider } from "./types";

export type ModelPrice = {
  provider: LlmProvider;
  model: string;
  label: string;
  inputPerMillion: number;
  outputPerMillion: number;
  free?: boolean;
};

// Fallback price table, USD per 1M tokens. OpenRouter reports an authoritative
// per-call cost in its usage block, so these entries only matter when that
// field is absent — but they are still what the ledger falls back to, and what
// the Settings picker shows before the live OpenRouter list loads.
// Update when providers move prices; token accounting is unaffected either way.
export const MODEL_PRICES: ModelPrice[] = [
  {
    provider: "anthropic",
    model: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    inputPerMillion: 5,
    outputPerMillion: 25,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    inputPerMillion: 1,
    outputPerMillion: 5,
  },
  {
    provider: "openai",
    model: "gpt-5.1",
    label: "GPT-5.1",
    inputPerMillion: 1.25,
    outputPerMillion: 10,
  },
  {
    provider: "openai",
    model: "gpt-5-mini",
    label: "GPT-5 mini",
    inputPerMillion: 0.25,
    outputPerMillion: 2,
  },
  {
    provider: "openai",
    model: "o4-mini",
    label: "o4-mini",
    inputPerMillion: 1.1,
    outputPerMillion: 4.4,
  },
  {
    provider: "openrouter",
    model: "inclusionai/ling-3.0-flash-sante:free",
    label: "Ling 3.0 Flash (free)",
    inputPerMillion: 0,
    outputPerMillion: 0,
    free: true,
  },
  {
    provider: "openrouter",
    model: "cohere/north-mini-code:free",
    label: "North Mini Code (free)",
    inputPerMillion: 0,
    outputPerMillion: 0,
    free: true,
  },
  {
    provider: "openrouter",
    model: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B (free)",
    inputPerMillion: 0,
    outputPerMillion: 0,
    free: true,
  },
  {
    provider: "openrouter",
    model: "openrouter/free",
    label: "OpenRouter auto-router (free)",
    inputPerMillion: 0,
    outputPerMillion: 0,
    free: true,
  },
];

const FALLBACK: Record<LlmProvider, { inputPerMillion: number; outputPerMillion: number }> = {
  anthropic: { inputPerMillion: 3, outputPerMillion: 15 },
  openai: { inputPerMillion: 1.25, outputPerMillion: 10 },
  // Unknown OpenRouter models may be paid; showing zero would understate cost,
  // so fall back to a mid-range estimate and let the reported cost win.
  openrouter: { inputPerMillion: 1, outputPerMillion: 4 },
};

export function priceFor(provider: LlmProvider, model: string) {
  const exact = MODEL_PRICES.find((p) => p.provider === provider && p.model === model);
  return exact ?? FALLBACK[provider];
}

export function costUsd(
  provider: LlmProvider,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = priceFor(provider, model);
  return (
    (inputTokens / 1_000_000) * price.inputPerMillion +
    (outputTokens / 1_000_000) * price.outputPerMillion
  );
}
