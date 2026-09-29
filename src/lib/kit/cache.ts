/**
 * TTL cache for the kit reads whose values barely move between cycles.
 *
 * Each kit call is a fresh Python process plus one or more HTTPS round trips,
 * so a 3-symbol cycle costs ~13 spawns and that dominates the wall time — far
 * more than the model call. The metadata reads (fees/decimals/min sizes), the
 * 24h stats, the 8h funding rate and settled candles can all be reused for a
 * while without changing a decision; the order book and account state cannot,
 * and are deliberately never cached here.
 *
 * Concurrent identical reads are de-duplicated so a page render and a cycle
 * starting together spawn one process, not two.
 */
type Entry = { at: number; value: unknown };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export const KIT_TTL_MS = {
  /** Fees, decimals, minimum order sizes and open interest. */
  marketInfo: 10 * 60_000,
  /** 24h change and volume. */
  marketStats: 2 * 60_000,
  /** 8h-equivalent funding, which venues update hourly at most. */
  marketFunding: 5 * 60_000,
  /** One candle resolution's worth: a 15m bucket is settled within its bucket. */
  marketCandles: 5 * 60_000,
} as const;

/** `LIGHTER_TRADER_KIT_CACHE_MS=0` disables caching entirely (useful when debugging). */
function ttlOverride(): number | null {
  const raw = process.env.LIGHTER_TRADER_KIT_CACHE_MS;
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function cacheKey(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join("|");
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const override = ttlOverride();
  const ttl = override ?? ttlMs;
  if (ttl <= 0) return load();

  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load().then(
    (value) => {
      store.set(key, { at: Date.now(), value });
      inflight.delete(key);
      return value;
    },
    (error: unknown) => {
      inflight.delete(key);
      throw error;
    },
  );

  inflight.set(key, promise);
  return promise;
}

export function clearResponseCache(): void {
  store.clear();
}

export function responseCacheStats(): { entries: number; inFlight: number } {
  return { entries: store.size, inFlight: inflight.size };
}
