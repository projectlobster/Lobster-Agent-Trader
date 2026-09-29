import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSettingsPatch, parseSymbolList, type SettingsDraft } from "@/lib/settings-patch";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/store/settings";

function draft(overrides: (d: Settings) => void = () => {}): SettingsDraft {
  const settings = structuredClone(DEFAULT_SETTINGS);
  overrides(settings);
  return { ...settings, llm: { ...settings.llm, apiKeySet: true } };
}

function build(overrides: Partial<Parameters<typeof buildSettingsPatch>[0]> = {}) {
  return buildSettingsPatch({
    draft: draft(),
    apiKey: "",
    apiKeyDirty: false,
    watchlistText: "BTC, ETH",
    allowedSymbolsText: "BTC, ETH",
    ...overrides,
  });
}

// Regression: the form hand-assembled the `llm` object and only sent provider,
// model and maxOutputTokens. `reasoningEffort` and `jsonMode` were dropped, so
// the console reported "settings saved" while discarding those two controls.
test("every editable llm field is sent", () => {
  const llm = build().llm as Record<string, unknown>;
  assert.equal(llm.provider, "openrouter");
  assert.equal(llm.model, "inclusionai/ling-3.0-flash-sante:free");
  assert.equal(llm.maxOutputTokens, 8_000);
  assert.ok("reasoningEffort" in llm, "reasoningEffort must be included");
  assert.ok("jsonMode" in llm, "jsonMode must be included");
  assert.equal(llm.reasoningEffort, "low");
  assert.equal(llm.jsonMode, false);
});

test("a reasoning-effort change survives the round trip", () => {
  const llm = build({
    draft: draft((d) => {
      d.llm.reasoningEffort = "high";
      d.llm.jsonMode = true;
    }),
  }).llm as Record<string, unknown>;
  assert.equal(llm.reasoningEffort, "high");
  assert.equal(llm.jsonMode, true);
});

test("the saved key is never echoed back when the field is untouched", () => {
  const llm = build({
    draft: draft((d) => {
      d.llm.apiKey = "sk-secret-stored";
    }),
    apiKeyDirty: false,
  }).llm as Record<string, unknown>;
  assert.equal("apiKey" in llm, false, "an untouched field must not resend the stored key");
  assert.equal("apiKeySet" in llm, false, "the read-only view flag must not be sent");
});

test("a typed key is sent only when the field was edited", () => {
  const llm = build({ apiKey: "sk-new", apiKeyDirty: true }).llm as Record<string, unknown>;
  assert.equal(llm.apiKey, "sk-new");
});

test("clearing the field intentionally sends an empty key", () => {
  const llm = build({ apiKey: "", apiKeyDirty: true }).llm as Record<string, unknown>;
  assert.equal(llm.apiKey, "");
});

test("symbol lists are parsed, normalised and de-duplicated by trimming", () => {
  assert.deepEqual(parseSymbolList(" btc , eth ,, sol "), ["BTC", "ETH", "SOL"]);
  assert.deepEqual(parseSymbolList(""), []);
});

test("the parsed lists replace the draft arrays rather than merging", () => {
  const patch = build({ watchlistText: "sol", allowedSymbolsText: "sol, btc" });
  assert.deepEqual((patch.agent as { watchlist: string[] }).watchlist, ["SOL"]);
  assert.deepEqual((patch.risk as { allowedSymbols: string[] }).allowedSymbols, ["SOL", "BTC"]);
});

test("untouched sections are passed through whole", () => {
  const patch = build();
  assert.deepEqual(patch.budget, DEFAULT_SETTINGS.budget);
  assert.deepEqual(patch.paper, DEFAULT_SETTINGS.paper);
  assert.deepEqual(patch.kit, DEFAULT_SETTINGS.kit);
});
