import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJsonBlock, parseDecision } from "@/lib/agent/schema";

const VALID = {
  action: "open",
  symbol: "BTC",
  side: "long",
  size_usd: 120,
  order_type: "market",
  limit_price: null,
  confidence: 0.7,
  thesis: "momentum is up.",
  invalidation: "loses the prior low.",
  horizon: "intraday",
};

test("a bare JSON object parses", () => {
  const result = parseDecision(JSON.stringify(VALID));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.decision.symbol, "BTC");
});

test("a fenced JSON block parses", () => {
  const result = parseDecision(`\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``);
  assert.equal(result.ok, true);
});

test("JSON wrapped in prose still parses", () => {
  const result = parseDecision(`Sure, here is my decision:\n${JSON.stringify(VALID)}\nLet me know.`);
  assert.equal(result.ok, true);
});

test("a schema violation is reported with the offending path", () => {
  const result = parseDecision(JSON.stringify({ ...VALID, symbol: null }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /symbol/);
});

test("a missing field is reported", () => {
  const { size_usd, ...rest } = VALID;
  const result = parseDecision(JSON.stringify(rest));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /size_usd/);
});

test("an out-of-range confidence is rejected", () => {
  const result = parseDecision(JSON.stringify({ ...VALID, confidence: 1.4 }));
  assert.equal(result.ok, false);
});

test("a response with no JSON object fails cleanly", () => {
  const result = parseDecision("I cannot help with that.");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /no JSON object/);
});

test("malformed JSON fails cleanly instead of throwing", () => {
  const result = parseDecision('{"action": "open", "symbol": }');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not valid JSON/);
});

test("extractJsonBlock takes the outermost object", () => {
  assert.equal(extractJsonBlock('prefix {"a":1} suffix'), '{"a":1}');
  assert.equal(extractJsonBlock("no object here"), null);
});
