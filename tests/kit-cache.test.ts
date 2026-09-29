import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheKey, cached, clearResponseCache, responseCacheStats } from "@/lib/kit/cache";

function withTtl(ms: string | undefined, run: () => Promise<void>) {
  const previous = process.env.LIGHTER_TRADER_KIT_CACHE_MS;
  if (ms === undefined) delete process.env.LIGHTER_TRADER_KIT_CACHE_MS;
  else process.env.LIGHTER_TRADER_KIT_CACHE_MS = ms;
  // The store is module-level and shared by every test in this file, so start
  // each case from a known state.
  clearResponseCache();
  return run().finally(() => {
    if (previous === undefined) delete process.env.LIGHTER_TRADER_KIT_CACHE_MS;
    else process.env.LIGHTER_TRADER_KIT_CACHE_MS = previous;
    clearResponseCache();
  });
}

test("a second identical read is served from cache", async () => {
  clearResponseCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { n: calls };
  };

  const first = await cached("k", 60_000, load);
  const second = await cached("k", 60_000, load);

  assert.equal(calls, 1, "the loader must run once");
  assert.equal(first, second, "the cached object should be reused");
});

test("an expired entry is re-read", async () => {
  clearResponseCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return calls;
  };

  await cached("k", 1, load);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const value = await cached("k", 1, load);

  assert.equal(calls, 2);
  assert.equal(value, 2);
});

test("concurrent identical reads share one loader call", async () => {
  clearResponseCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return "value";
  };

  const results = await Promise.all([
    cached("k", 60_000, load),
    cached("k", 60_000, load),
    cached("k", 60_000, load),
  ]);

  assert.equal(calls, 1, "in-flight reads must be de-duplicated");
  assert.deepEqual(results, ["value", "value", "value"]);
});

test("different keys do not collide", async () => {
  clearResponseCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return calls;
  };

  await cached("a", 60_000, load);
  await cached("b", 60_000, load);

  assert.equal(calls, 2);
});

// A failed read must not be remembered, or one transient network blip would
// pin an error for the whole TTL.
test("a failure is not cached", async () => {
  clearResponseCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    if (calls === 1) throw new Error("transient");
    return "recovered";
  };

  await assert.rejects(() => cached("k", 60_000, load), /transient/);
  const value = await cached("k", 60_000, load);

  assert.equal(calls, 2, "the retry must reach the loader");
  assert.equal(value, "recovered");
});

test("a failed concurrent read frees the in-flight slot for the next caller", async () => {
  clearResponseCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (calls === 1) throw new Error("boom");
    return "ok";
  };

  const [first] = await Promise.allSettled([cached("k", 60_000, load)]);
  assert.equal(first.status, "rejected");
  assert.equal(responseCacheStats().inFlight, 0);

  assert.equal(await cached("k", 60_000, load), "ok");
});

test("the env override disables caching when set to zero", async () => {
  await withTtl("0", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };
    await cached("k", 60_000, load);
    await cached("k", 60_000, load);
    assert.equal(calls, 2, "ttl 0 must bypass the cache entirely");
    assert.equal(responseCacheStats().entries, 0);
  });
});

test("the env override replaces the per-key ttl", async () => {
  await withTtl("60000", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };
    // A per-key ttl of 1ms would normally expire, but the override holds it.
    await cached("k", 1, load);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await cached("k", 1, load);
    assert.equal(calls, 1);
  });
});

test("cache keys are stable and exclude empty parts", () => {
  assert.equal(cacheKey(["query", "market", "info", undefined]), "query|market|info");
  assert.equal(cacheKey(["query", "market", "info", "https://host"]), "query|market|info|https://host");
  assert.notEqual(
    cacheKey(["query", "market", "book", "BTC", "https://a"]),
    cacheKey(["query", "market", "book", "BTC", "https://b"]),
  );
});

test("clearResponseCache empties the store", async () => {
  clearResponseCache();
  await cached("k", 60_000, async () => 1);
  assert.equal(responseCacheStats().entries, 1);
  clearResponseCache();
  assert.equal(responseCacheStats().entries, 0);
});
