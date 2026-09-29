import { fail, ok } from "@/lib/api";
import { readAccountState } from "@/lib/agent/account";
import { engineStatus } from "@/lib/agent/engine";
import { readSettings } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") !== "false";
  const settings = readSettings();
  const mode = engineStatus().mode;

  try {
    const state = await readAccountState(settings, mode, { refresh });
    return ok({ mode, ...state });
  } catch (error) {
    return fail(error);
  }
}
