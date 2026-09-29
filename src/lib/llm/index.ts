import { completeAnthropic } from "./anthropic";
import { completeOpenAi } from "./openai";
import { completeOpenRouter } from "./openrouter";
import { costUsd } from "./pricing";
import {
  LlmError,
  LlmNotConfiguredError,
  type CompleteInput,
  type CompleteResult,
  type LlmProvider,
} from "./types";

export { MODEL_PRICES, costUsd, priceFor } from "./pricing";
export { ENV_KEY, LlmError, LlmNotConfiguredError } from "./types";
export type { CompleteInput, CompleteResult, LlmProvider, ReasoningEffort } from "./types";

export type LlmCall = CompleteResult & { costUsd: number };

export const PROVIDERS: LlmProvider[] = ["anthropic", "openai", "openrouter"];

const RETRYABLE = /HTTP (429|500|502|503|504|522|524|529)\b|\b429\b|rate.?limit/i;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 3_000];

export async function complete(input: CompleteInput): Promise<LlmCall> {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    throw new LlmNotConfiguredError(input.provider);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result =
        input.provider === "anthropic"
          ? await completeAnthropic(input)
          : input.provider === "openrouter"
            ? await completeOpenRouter(input)
            : await completeOpenAi(input);

      // Prefer the provider's own cost when it reports one. Free models report
      // an explicit 0, which is correct and must not be replaced by the table.
      const computed = costUsd(result.provider, result.model, result.inputTokens, result.outputTokens);

      return {
        ...result,
        costUsd: result.providerCostUsd ?? computed,
      };
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof LlmError &&
        RETRYABLE.test(`${error.message} ${error.detail ?? ""}`);
      if (!retryable || attempt === MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt - 1] ?? 3_000));
    }
  }

  throw lastError instanceof Error ? lastError : new LlmError("LLM call failed");
}
