import { ok } from "@/lib/api";
import { engineStatus } from "@/lib/agent/engine";
import { complete, PROVIDERS, type LlmProvider } from "@/lib/llm";
import { apiKeyForProvider, readSettings } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PROBE_SYSTEM =
  'Reply with exactly one JSON object and nothing else: {"status":"ok","note":"<one short sentence>"}';

const PROBE_USERS = new Set(["anthropic", "openai", "openrouter"]);

export async function POST(request: Request) {
  let body: { provider?: unknown; model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const settings = readSettings();
  const requested = typeof body.provider === "string" ? body.provider : settings.llm.provider;

  if (!PROBE_USERS.has(requested)) {
    return ok({
      ok: false,
      detail: `unknown provider "${requested}"; expected one of ${PROVIDERS.join(", ")}`,
    });
  }

  const provider = requested as LlmProvider;
  const model = typeof body.model === "string" && body.model.trim().length > 0
    ? body.model.trim()
    : settings.llm.model;

  // Resolve the key for *this* provider. Passing the configured provider's key
  // to a different provider's endpoint would hand one vendor's secret to
  // another, so a mismatch must fail closed instead.
  const apiKey = apiKeyForProvider(settings, provider);
  if (!apiKey) {
    return ok({
      ok: false,
      provider,
      model,
      detail:
        provider === settings.llm.provider
          ? `no API key for ${provider} — add one above and save, or set ${providerKeyName(provider)} in .env.local`
          : `no API key for ${provider}. The key saved in Settings belongs to ${settings.llm.provider}; set ${providerKeyName(provider)} in .env.local to probe another provider.`,
    });
  }

  try {
    const call = await complete({
      provider,
      model,
      apiKey,
      system: PROBE_SYSTEM,
      user: "Confirm you are reachable.",
      maxOutputTokens: 600,
      reasoningEffort: settings.llm.reasoningEffort,
    });

    return ok({
      ok: true,
      provider: call.provider,
      model: call.model,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costUsd: call.costUsd,
      latencyMs: call.latencyMs,
      mode: engineStatus().mode,
    });
  } catch (error) {
    const detail = (error as { detail?: unknown }).detail;
    return ok({
      ok: false,
      provider,
      model,
      detail:
        (error instanceof Error ? error.message : String(error)) +
        (typeof detail === "string" && detail.length > 0 ? ` — ${detail}` : ""),
    });
  }
}

function providerKeyName(provider: LlmProvider): string {
  return provider === "anthropic"
    ? "LIGHTER_TRADER_ANTHROPIC_API_KEY"
    : provider === "openai"
      ? "LIGHTER_TRADER_OPENAI_API_KEY"
      : "LIGHTER_TRADER_OPENROUTER_API_KEY";
}
