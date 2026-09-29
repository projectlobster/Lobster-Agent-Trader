import { authStatus, health, systemStatus } from "@/lib/kit/query";
import { responseCacheStats } from "@/lib/kit/cache";
import { kitLocation } from "@/lib/kit/locate";
import { fail, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const location = kitLocation();
  const cache = responseCacheStats();

  if (!location.installed) {
    return ok({
      ...location,
      cache,
      health: null,
      auth: null,
      system: null,
      message:
        "lighter-agent-kit was not found. Run `npm run setup`, or install it to ~/.agents/skills/lighter-agent-kit.",
    });
  }

  const [healthResult, authResult, systemResult] = await Promise.allSettled([
    health(),
    authStatus(),
    systemStatus(),
  ]);

  return ok({
    ...location,
    cache,
    health: healthResult.status === "fulfilled" ? healthResult.value : null,
    healthError: healthResult.status === "rejected" ? String(healthResult.reason) : null,
    auth: authResult.status === "fulfilled" ? authResult.value : null,
    authError: authResult.status === "rejected" ? String(authResult.reason) : null,
    system: systemResult.status === "fulfilled" ? systemResult.value : null,
    systemError: systemResult.status === "rejected" ? String(systemResult.reason) : null,
  });
}

export async function POST() {
  try {
    return ok({ health: await health() });
  } catch (error) {
    return fail(error);
  }
}
