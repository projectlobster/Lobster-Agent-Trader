import { fail, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CatalogModel = {
  id: string;
  name: string;
  contextLength: number | null;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  free: boolean;
  textOnly: boolean;
};

type Cache = { at: number; models: CatalogModel[] };
const globalCache = globalThis as typeof globalThis & { __ltModelCache?: Cache };
const TTL_MS = 10 * 60 * 1000;

function toPricePerMillion(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(parsed)) return null;
  return parsed * 1_000_000;
}

export async function loadCatalog(): Promise<CatalogModel[]> {
  const cached = globalCache.__ltModelCache;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.models;

  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter model list returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
      architecture?: { input_modalities?: string[]; output_modalities?: string[] };
    }>;
  };

  const models: CatalogModel[] = (payload.data ?? [])
    .flatMap((entry) => (typeof entry.id === "string" ? [{ ...entry, id: entry.id }] : []))
    .map((entry) => {
      const input = toPricePerMillion(entry.pricing?.prompt);
      const output = toPricePerMillion(entry.pricing?.completion);
      const outModalities = entry.architecture?.output_modalities ?? ["text"];
      return {
        id: entry.id,
        name: entry.name ?? entry.id,
        contextLength: entry.context_length ?? null,
        inputPerMillion: input,
        outputPerMillion: output,
        free: input === 0 && output === 0,
        textOnly: outModalities.length === 1 && outModalities[0] === "text",
      };
    })
    .sort((a, b) => {
      if (a.free !== b.free) return a.free ? -1 : 1;
      return (b.contextLength ?? 0) - (a.contextLength ?? 0);
    });

  globalCache.__ltModelCache = { at: Date.now(), models };
  return models;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const freeOnly = url.searchParams.get("free") === "true";

  try {
    const models = await loadCatalog();
    return ok({
      models: freeOnly ? models.filter((model) => model.free) : models,
      total: models.length,
      free: models.filter((model) => model.free).length,
      source: "openrouter",
    });
  } catch (error) {
    return fail(error);
  }
}
