import { fail, ok } from "@/lib/api";
import { listLlmCalls } from "@/lib/store/llm";
import { getRun, listRuns, tokensUsedInPeriod } from "@/lib/store/runs";
import { allowanceOf, getOrCreatePeriod } from "@/lib/store/periods";
import { readSettings } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      const record = getRun(id);
      if (!record) return ok({ error: "run not found", code: "not_found" }, 404);
      const parse = (value: string | null) => {
        if (!value) return null;
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return value;
        }
      };
      return ok({
        run: {
          ...record,
          decision: parse(record.decision_json),
          snapshot: parse(record.snapshot_json),
          trace: parse(record.trace_json),
          order: parse(record.order_json),
        },
        llmCalls: listLlmCalls(record.id),
      });
    }

    const limit = Number(url.searchParams.get("limit") ?? 25);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const settings = readSettings();
    const period = getOrCreatePeriod(settings);

    return ok({
      runs: listRuns({
        limit: Number.isFinite(limit) ? limit : 25,
        offset: Number.isFinite(offset) ? offset : 0,
      }),
      period: {
        periodKey: period.period_key,
        allowanceTokens: allowanceOf(period),
        usedTokens: tokensUsedInPeriod(period.period_key),
      },
    });
  } catch (error) {
    return fail(error);
  }
}
