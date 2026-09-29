import { z } from "zod";

export const DecisionSchema = z.object({
  action: z.enum(["open", "close", "hold"]),
  symbol: z.string().trim().min(1).max(24),
  side: z.enum(["long", "short"]).nullable(),
  size_usd: z.number().min(0).max(1_000_000),
  order_type: z.enum(["market", "ioc"]),
  limit_price: z.number().positive().nullable(),
  confidence: z.number().min(0).max(1),
  thesis: z.string().trim().min(1).max(600),
  invalidation: z.string().trim().max(600),
  horizon: z.enum(["intraday", "swing"]),
});

export type Decision = z.infer<typeof DecisionSchema>;

export type ParseResult =
  | { ok: true; decision: Decision }
  | { ok: false; error: string };

export function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

export function parseDecision(text: string): ParseResult {
  const json = extractJsonBlock(text);
  if (json === null) {
    return { ok: false, error: "response contained no JSON object" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      error: `response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const result = DecisionSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: `schema validation failed: ${issues}` };
  }

  return { ok: true, decision: result.data };
}

export function decisionSchemaForPrompt(): string {
  return `{
  "action": "open" | "close" | "hold",
  "symbol": string,                 // perp ticker from the watchlist, e.g. "BTC"
  "side": "long" | "short" | null,  // required for "open", null otherwise
  "size_usd": number,               // notional in USD, required for "open", 0 otherwise
  "order_type": "market" | "ioc",   // "ioc" requires limit_price
  "limit_price": number | null,     // only for "ioc"
  "confidence": number,             // 0..1, your calibrated probability this is a good trade
  "thesis": string,                 // 1-2 sentences, the actual reason
  "invalidation": string,           // what would prove this wrong
  "horizon": "intraday" | "swing"
}`;
}
