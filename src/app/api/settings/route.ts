import { z } from "zod";
import { badRequest, fail, ok } from "@/lib/api";
import { engineStatus, stopEngine } from "@/lib/agent/engine";
import { clearResponseCache } from "@/lib/kit/cache";
import { kitLocation } from "@/lib/kit/locate";
import { MODEL_PRICES } from "@/lib/llm";
import { lintSettings } from "@/lib/settings-lint";
import { updateEngineState } from "@/lib/store/engine";
import { HOSTS, envPinnedFields, publicSettings, readSettings, writeSettings } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const httpUrl = z
  .string()
  .min(1)
  .refine((value) => /^https?:\/\/\S+$/.test(value), "must be an http(s) URL");

const SettingsPatch = z.object({
  llm: z
    .object({
      provider: z.enum(["anthropic", "openai", "openrouter"]).optional(),
      model: z.string().min(1).max(160).optional(),
      apiKey: z.string().max(400).optional(),
      maxOutputTokens: z.number().int().min(128).max(32_000).optional(),
      reasoningEffort: z.enum(["off", "low", "medium", "high"]).optional(),
      jsonMode: z.boolean().optional(),
    })
    .optional(),
  budget: z
    .object({
      monthlyTokens: z.number().int().min(0).max(1_000_000_000).optional(),
      reservedForWork: z.number().int().min(0).max(1_000_000_000).optional(),
      carryOverLeftover: z.boolean().optional(),
      resetDay: z.number().int().min(1).max(28).optional(),
    })
    .optional(),
  kit: z
    .object({
      host: httpUrl.optional(),
      paperStatePath: z.string().max(400).optional(),
      python: z.string().max(200).optional(),
    })
    .optional(),
  agent: z
    .object({
      watchlist: z.array(z.string().min(1).max(24)).min(1).max(12).optional(),
      intervalSeconds: z.number().int().min(15).max(86_400).optional(),
      candleResolution: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]).optional(),
      candleCountBack: z.number().int().min(2).max(200).optional(),
      bookDepth: z.number().int().min(1).max(20).optional(),
    })
    .optional(),
  risk: z
    .object({
      allowedSymbols: z.array(z.string().min(1).max(24)).max(12).optional(),
      maxNotionalUsd: z.number().min(1).max(100_000).optional(),
      maxLeverage: z.number().min(1).max(5).optional(),
      maxOpenPositions: z.number().int().min(0).max(20).optional(),
      maxCyclesPerDay: z.number().int().min(1).max(288).optional(),
      cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
      minConfidence: z.number().min(0).max(1).optional(),
      dailyLossLimitUsd: z.number().min(1).max(100_000).optional(),
    })
    .optional(),
  paper: z
    .object({
      initialCollateral: z.number().min(1).max(10_000_000).optional(),
      tier: z.string().min(1).max(40).optional(),
    })
    .optional(),
  mode: z.enum(["paper", "live"]).optional(),
  liveEnabled: z.boolean().optional(),
});

export async function GET() {
  const settings = readSettings();
  return ok({
    settings: publicSettings(settings),
    kit: kitLocation(),
    engine: engineStatus(),
    hosts: HOSTS,
    models: MODEL_PRICES,
    envLiveEnabled: process.env.LIGHTER_ENABLE_LIVE === "1",
    envPinned: envPinnedFields(),
    warnings: lintSettings(settings),
  });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("expected a JSON body");
  }

  const parsed = SettingsPatch.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return badRequest(`invalid settings: ${issues}`, "invalid_settings");
  }

  const patch = parsed.data;
  const envLive = process.env.LIGHTER_ENABLE_LIVE === "1";

  if (patch.liveEnabled === true && !envLive) {
    return badRequest(
      "live trading needs LIGHTER_ENABLE_LIVE=1 in the server environment before the switch can be turned on",
      "live_gate_closed",
    );
  }

  const current = readSettings();
  const nextLiveEnabled = patch.liveEnabled ?? current.liveEnabled;
  const nextMode = patch.mode ?? current.mode;

  if (nextMode === "live") {
    if (!nextLiveEnabled) {
      return badRequest("enable the live switch before switching the engine to live", "live_gate_closed");
    }
    if (!envLive) {
      return badRequest(
        "LIGHTER_ENABLE_LIVE must be 1 in the server environment to run live",
        "live_gate_closed",
      );
    }
  }

  try {
    const settings = writeSettings(patch);

    // The kit reads are TTL-cached. Market metadata and candles are keyed by
    // symbol, so a newly added watchlist entry (or a different deployment)
    // would be invisible to the snapshot until the TTL expired, and the cycle
    // would fail with "no market data". Drop the cache when those change.
    const watchlistChanged =
      patch.agent?.watchlist !== undefined &&
      patch.agent.watchlist.join(",").toUpperCase() !==
        current.agent.watchlist.join(",").toUpperCase();
    const hostChanged = patch.kit?.host !== undefined && patch.kit.host !== current.kit.host;
    if (watchlistChanged || hostChanged) {
      clearResponseCache();
    }

    // engine_state.mode is the effective mode every tick reads, so it has to
    // follow the setting rather than drift until the next engine start.
    if (patch.mode) {
      if (patch.mode !== current.mode && engineStatus().running) {
        stopEngine("mode_changed");
      }
      updateEngineState({ mode: patch.mode });
    }

    return ok({
      settings: publicSettings(settings),
      engine: engineStatus(),
      warnings: lintSettings(settings),
    });
  } catch (error) {
    return fail(error);
  }
}
