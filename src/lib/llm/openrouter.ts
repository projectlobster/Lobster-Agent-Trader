import { completeChatCompletions } from "./chatCompletions";
import type { CompleteInput, CompleteResult } from "./types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export async function completeOpenRouter(input: CompleteInput): Promise<CompleteResult> {
  return completeChatCompletions(input, {
    endpoint: ENDPOINT,
    label: "OpenRouter",
    tokenParam: "max_tokens",
    requestCost: true,
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      // OpenRouter uses these for attribution on their dashboard.
      "http-referer": "https://github.com/elliottech/lighter-agent-kit",
      "x-title": "Lobster Agent Trader",
    },
  });
}
