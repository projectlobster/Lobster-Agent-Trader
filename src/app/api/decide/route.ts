import { fail, ok } from "@/lib/api";
import { runManualTick } from "@/lib/agent/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const attempt = await runManualTick();
    if (attempt.kind === "busy") {
      return ok({ error: attempt.reason, code: "cycle_in_progress" }, 409);
    }
    return ok(attempt.result);
  } catch (error) {
    return fail(error);
  }
}
