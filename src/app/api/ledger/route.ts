import { fail, ok } from "@/lib/api";
import { engineStatus } from "@/lib/agent/engine";
import { readAccountState } from "@/lib/agent/account";
import { buildLedger } from "@/lib/overview";
import { readSettings } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") !== "false";
  try {
    const settings = readSettings();
    const mode = engineStatus().mode;
    const accountState = await readAccountState(settings, mode, { refresh });
    return ok({
      ledger: buildLedger(settings, accountState.account),
      account: accountState.account,
      warnings: accountState.warnings,
    });
  } catch (error) {
    return fail(error);
  }
}
