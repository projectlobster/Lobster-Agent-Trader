import { badRequest, fail, ok } from "@/lib/api";
import { engineStatus, startEngine, stopEngine } from "@/lib/agent/engine";
import { closeAll, closeAllPreview } from "@/lib/kit/trade";
import { readSettings } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONFIRMATION = "CLOSE ALL";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("expected a JSON body");
  }

  const payload = body as { preview?: unknown; confirm?: unknown };
  const settings = readSettings();
  const options = { host: settings.kit.host || undefined };

  try {
    if (payload.preview === true) {
      return ok({ preview: await closeAllPreview(options) });
    }

    if (payload.confirm !== CONFIRMATION) {
      return badRequest(
        `refusing to flatten every position without an explicit confirmation of "${CONFIRMATION}"`,
        "confirmation_required",
      );
    }

    if (engineStatus().mode !== "live") {
      return badRequest(
        "close_all only applies to the live account; the paper account is reset from the Agent page",
        "wrong_mode",
      );
    }

    // Stop first so no new cycle can open a position mid-close. If the
    // broadcast then fails, restart the engine: leaving it stopped would look
    // like a deliberate halt while positions are still exposed.
    const previousInterval = engineStatus().intervalSeconds;
    stopEngine("close_all_requested");
    try {
      const result = await closeAll({ slippage: 0.005 }, options);
      if (result.status === "error") {
        startEngine(previousInterval, "live");
        return ok({
          result,
          note: "close_all failed on every market; the engine was restarted because positions remain open",
        });
      }
      return ok({ result });
    } catch (error) {
      startEngine(previousInterval, "live");
      throw error;
    }
  } catch (error) {
    return fail(error);
  }
}
