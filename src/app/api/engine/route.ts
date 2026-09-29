import { badRequest, fail, ok } from "@/lib/api";
import { engineStatus, startEngine, stopEngine } from "@/lib/agent/engine";
import { authStatus } from "@/lib/kit/query";
import { findKitDir } from "@/lib/kit/locate";
import { readSettings, type TradingMode } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ engine: engineStatus(), kitInstalled: findKitDir() !== null });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("expected a JSON body");
  }

  const action = (body as { action?: unknown })?.action;
  const settings = readSettings();

  try {
    if (action === "stop") {
      const reason = (body as { reason?: unknown })?.reason;
      return ok({ engine: stopEngine(typeof reason === "string" ? reason : "stopped by operator") });
    }

    if (action !== "start") {
      return badRequest("action must be 'start' or 'stop'");
    }

    const requested = (body as { mode?: unknown })?.mode;
    const mode: TradingMode = requested === "live" ? "live" : requested === "paper" ? "paper" : (settings.mode as TradingMode);

    if (!findKitDir()) {
      return badRequest(
        "lighter-agent-kit is not installed; run `npm run setup` before starting the engine",
        "kit_not_installed",
      );
    }

    if (mode === "live") {
      if (!settings.liveEnabled) {
        return badRequest(
          "live trading is disabled in Settings; enable the live switch first",
          "live_gate_closed",
        );
      }
      if (process.env.LIGHTER_ENABLE_LIVE !== "1") {
        return badRequest(
          "live trading needs LIGHTER_ENABLE_LIVE=1 in the server environment",
          "live_gate_closed",
        );
      }
      const auth = await authStatus({ host: settings.kit.host || undefined });
      if (!auth.auth_capable) {
        return badRequest(
          `missing Lighter credentials: ${auth.missing.join(", ")}`,
          "credentials_missing",
        );
      }
    }

    const intervalRaw = (body as { intervalSeconds?: unknown })?.intervalSeconds;
    const intervalSeconds =
      typeof intervalRaw === "number" && Number.isFinite(intervalRaw)
        ? intervalRaw
        : settings.agent.intervalSeconds;

    return ok({ engine: startEngine(intervalSeconds, mode) });
  } catch (error) {
    return fail(error);
  }
}
