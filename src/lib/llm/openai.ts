import { completeChatCompletions } from "./chatCompletions";
import type { CompleteInput, CompleteResult } from "./types";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export async function completeOpenAi(input: CompleteInput): Promise<CompleteResult> {
  return completeChatCompletions(input, {
    endpoint: ENDPOINT,
    label: "OpenAI",
    tokenParam: "max_completion_tokens",
    headers: { authorization: `Bearer ${input.apiKey}` },
  });
}
