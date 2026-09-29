import assert from "node:assert/strict";
import { test } from "node:test";
import { cn } from "@/lib/cn";

// Regression: Tailwind v4 shares the `text-*` namespace between font sizes and
// colours. Before the merge config existed, tailwind-merge collapsed the two and
// dropped the colour, so primary buttons rendered dark text on a dark fill.
test("a custom text colour and a custom font size survive together", () => {
  const merged = cn("bg-ink text-canvas", "text-body-xs");
  assert.match(merged, /text-canvas/);
  assert.match(merged, /text-body-xs/);
});

test("a text colour is not swallowed by a later font size", () => {
  const merged = cn("text-ink-muted", "text-label-sm", "uppercase");
  assert.match(merged, /text-ink-muted/);
  assert.match(merged, /text-label-sm/);
});

test("later colours still override earlier colours", () => {
  const merged = cn("text-ink", "text-negative");
  assert.match(merged, /text-negative/);
  assert.doesNotMatch(merged, /text-ink\b/);
});

test("later font sizes still override earlier font sizes", () => {
  const merged = cn("text-h2", "text-body");
  assert.match(merged, /text-body/);
  assert.doesNotMatch(merged, /text-h2/);
});

test("conditional classes compose", () => {
  const merged = cn("bg-surface", false && "hidden", ["text-ink", "p-4"]);
  assert.match(merged, /bg-surface/);
  assert.match(merged, /text-ink/);
  assert.match(merged, /p-4/);
  assert.doesNotMatch(merged, /hidden/);
});
