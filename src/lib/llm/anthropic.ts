import { LlmError, type CompleteInput, type CompleteResult } from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  stop_reason?: string | null;
};

export async function completeAnthropic(input: CompleteInput): Promise<CompleteResult> {
  const started = Date.now();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxOutputTokens,
      temperature: 0,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    }),
    signal: input.signal,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new LlmError(`Anthropic returned HTTP ${response.status}`, extractMessage(raw));
  }

  let payload: AnthropicResponse;
  try {
    payload = JSON.parse(raw) as AnthropicResponse;
  } catch {
    throw new LlmError("Anthropic returned a non-JSON body", raw.slice(0, 400));
  }

  const text = (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  if (text.length === 0) {
    throw new LlmError(
      "Anthropic returned no text content",
      `stop_reason=${payload.stop_reason ?? "unknown"}`,
    );
  }

  return {
    text,
    provider: "anthropic",
    model: payload.model ?? input.model,
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
    latencyMs: Date.now() - started,
    stopReason: payload.stop_reason ?? null,
  };
}

function extractMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    return parsed.error?.message ?? parsed.message ?? raw.slice(0, 400);
  } catch {
    return raw.slice(0, 400);
  }
}
