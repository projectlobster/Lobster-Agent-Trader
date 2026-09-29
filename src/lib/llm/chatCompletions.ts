import { LlmError, type CompleteInput, type CompleteResult } from "./types";

export type ChatCompletionsOptions = {
  endpoint: string;
  label: string;
  /** OpenAI renamed this for newer models; OpenRouter still takes max_tokens. */
  tokenParam: "max_tokens" | "max_completion_tokens";
  headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  /** Ask the provider to return an authoritative cost with the usage block. */
  requestCost?: boolean;
};

type ChatCompletionsResponse = {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
  model?: string;
  error?: { message?: string; code?: number | string };
};

export async function completeChatCompletions(
  input: CompleteInput,
  options: ChatCompletionsOptions,
): Promise<CompleteResult> {
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: input.model,
    [options.tokenParam]: input.maxOutputTokens,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  };

  if (input.reasoningEffort && input.reasoningEffort !== "off") {
    // Reasoning models otherwise spend the whole output budget thinking and
    // return an empty message with finish_reason "length".
    body.reasoning = { effort: input.reasoningEffort };
  } else if (input.reasoningEffort === "off") {
    body.reasoning = { enabled: false };
  }

  if (options.requestCost) {
    body.usage = { include: true };
  }

  if (input.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  Object.assign(body, options.extraBody ?? {});

  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new LlmError(
      `${options.label} returned HTTP ${response.status}`,
      extractMessage(raw),
    );
  }

  let payload: ChatCompletionsResponse;
  try {
    payload = JSON.parse(raw) as ChatCompletionsResponse;
  } catch {
    throw new LlmError(`${options.label} returned a non-JSON body`, raw.slice(0, 400));
  }

  if (payload.error) {
    throw new LlmError(
      `${options.label}: ${payload.error.message ?? "unknown error"}`,
      JSON.stringify(payload.error).slice(0, 400),
    );
  }

  const choice = payload.choices?.[0];
  const text = (choice?.message?.content ?? "").trim();

  if (text.length === 0) {
    throw new LlmError(
      `${options.label} returned no text content`,
      `finish_reason=${choice?.finish_reason ?? "unknown"}` +
        (choice?.finish_reason === "length"
          ? " — the model ran out of output budget before writing an answer; raise max output tokens or lower reasoning effort"
          : ""),
    );
  }

  const cost = payload.usage?.cost;

  return {
    text,
    provider: input.provider,
    model: payload.model ?? input.model,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - started,
    stopReason: choice?.finish_reason ?? null,
    ...(typeof cost === "number" ? { providerCostUsd: cost } : {}),
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
