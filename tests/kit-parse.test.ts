import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKitStdout } from "@/lib/kit/run";

test("clean JSON on stdout parses", () => {
  assert.deepEqual(parseKitStdout('{"status":"ok","version":"0.1.0"}'), {
    status: "ok",
    version: "0.1.0",
  });
});

test("pretty-printed JSON with indent parses", () => {
  const raw = `{
  "status": "ok",
  "collateral": 10000
}`;
  assert.deepEqual(parseKitStdout(raw), { status: "ok", collateral: 10000 });
});

test("a leading warning line does not break parsing", () => {
  const raw = "WARNING: something on stderr leaked into stdout\n{\"status\":\"ok\"}";
  assert.deepEqual(parseKitStdout(raw), { status: "ok" });
});

test("the error envelope survives parsing", () => {
  const parsed = parseKitStdout('{"error": "no paper account; run `paper.py init` first"}');
  assert.deepEqual(parsed, { error: "no paper account; run `paper.py init` first" });
});

test("empty stdout yields undefined", () => {
  assert.equal(parseKitStdout(""), undefined);
  assert.equal(parseKitStdout("   \n  "), undefined);
});

test("unparseable output yields undefined rather than throwing", () => {
  assert.equal(parseKitStdout("total garbage"), undefined);
  assert.equal(parseKitStdout("{unterminated"), undefined);
});

test("a bare JSON array is not mistaken for a command result", () => {
  // The kit always prints an object; an array means we are looking at something else.
  assert.deepEqual(parseKitStdout("[1,2,3]"), [1, 2, 3]);
});
