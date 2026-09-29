export type LlmProvider = "anthropic" | "openai" | "openrouter";

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export class LlmError extends Error {
  readonly code = "llm_failed";
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export class LlmNotConfiguredError extends Error {
  readonly code = "llm_not_configured";
  constructor(provider: string) {
    super(
      `No API key configured for ${provider}. Add one in Settings or set ${ENV_KEY[provider as LlmProvider] ?? "the matching env var"} in .env.local.`,
    );
    this.name = "LlmNotConfiguredError";
  }
}

export const ENV_KEY: Record<LlmProvider, string> = {
  anthropic: "LIGHTER_TRADER_ANTHROPIC_API_KEY",
  openai: "LIGHTER_TRADER_OPENAI_API_KEY",
  openrouter: "LIGHTER_TRADER_OPENROUTER_API_KEY",
};

export type CompleteInput = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  reasoningEffort?: ReasoningEffort;
  /** Ask the provider to constrain the reply to a JSON object. */
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export type CompleteResult = {
  text: string;
  provider: LlmProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  stopReason?: string | null;
  /** Authoritative cost reported by the provider, when it reports one. */
  providerCostUsd?: number;
};
