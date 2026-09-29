import { badRequest, failKit, ok } from "@/lib/api";
import { paperInit, paperReset, paperStatus } from "@/lib/kit/paper";
import { run } from "@/lib/store/db";
import { readSettings } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") !== "false";
  const settings = readSettings();
  try {
    const status = await paperStatus(
      { refresh },
      { host: settings.kit.host || undefined, statePath: settings.kit.paperStatePath || undefined },
    );
    return ok({ status });
  } catch (error) {
    return failKit(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("expected a JSON body");
  }

  const action = (body as { action?: unknown })?.action;
  if (action !== "init" && action !== "reset") {
    return badRequest("action must be 'init' or 'reset'");
  }

  const settings = readSettings();
  const collateralRaw = (body as { collateral?: unknown })?.collateral;
  const tierRaw = (body as { tier?: unknown })?.tier;
  const args = {
    collateral:
      typeof collateralRaw === "number" && Number.isFinite(collateralRaw)
        ? collateralRaw
        : settings.paper.initialCollateral,
    tier: typeof tierRaw === "string" && tierRaw.length > 0 ? tierRaw : settings.paper.tier,
  };

  const options = {
    host: settings.kit.host || undefined,
    statePath: settings.kit.paperStatePath || undefined,
  };

  try {
    const result =
      action === "init" ? await paperInit(args, options) : await paperReset(args, options);

    // A reset creates a brand-new paper account at its starting collateral.
    // Leaving the old equity rows in place would splice two different accounts
    // into one curve, so the PnL series would be fiction. The decision log
    // (runs/orders) is kept as an audit trail.
    if (action === "reset") {
      run("DELETE FROM equity WHERE mode = 'paper'");
    }

    return ok({ status: result });
  } catch (error) {
    return failKit(error);
  }
}
