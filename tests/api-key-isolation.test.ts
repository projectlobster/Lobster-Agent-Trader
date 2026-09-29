import assert from "node:assert/strict";
import { test } from "node:test";
import { apiKeyForProvider } from "@/lib/store/settings";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/store/settings";

function settingsWith(overrides: (draft: Settings) => void): Settings {
  const draft = structuredClone(DEFAULT_SETTINGS);
  overrides(draft);
  return draft;
}

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const ANTHROPIC_ENV = "LIGHTER_TRADER_ANTHROPIC_API_KEY";
const OPENAI_ENV = "LIGHTER_TRADER_OPENAI_API_KEY";
const OPENROUTER_ENV = "LIGHTER_TRADER_OPENROUTER_API_KEY";

// Regression: the probe endpoint used to resolve the *configured* provider's
// key and then send it to whatever provider the request body asked for, which
// handed one vendor's secret to another vendor's API.
test("a stored key is never handed to a different provider", () => {
  withEnv({ [ANTHROPIC_ENV]: undefined, [OPENAI_ENV]: undefined, [OPENROUTER_ENV]: undefined }, () => {
    const settings = settingsWith((draft) => {
      draft.llm.provider = "openrouter";
      draft.llm.apiKey = "sk-or-secret";
    });

    assert.equal(apiKeyForProvider(settings, "openrouter"), "sk-or-secret");
    assert.equal(apiKeyForProvider(settings, "anthropic"), undefined);
    assert.equal(apiKeyForProvider(settings, "openai"), undefined);
  });
});

test("an env key is only used for its own provider", () => {
  withEnv({ [ANTHROPIC_ENV]: "sk-ant-env", [OPENAI_ENV]: undefined, [OPENROUTER_ENV]: undefined }, () => {
    const settings = settingsWith((draft) => {
      draft.llm.provider = "openrouter";
      draft.llm.apiKey = "sk-or-stored";
    });

    assert.equal(apiKeyForProvider(settings, "anthropic"), "sk-ant-env");
    // The env key for anthropic must not become the openrouter key.
    assert.equal(apiKeyForProvider(settings, "openrouter"), "sk-or-stored");
  });
});

test("an env key wins over the stored key for the same provider", () => {
  withEnv({ [OPENROUTER_ENV]: "sk-or-env" }, () => {
    const settings = settingsWith((draft) => {
      draft.llm.provider = "openrouter";
      draft.llm.apiKey = "sk-or-stored";
    });
    assert.equal(apiKeyForProvider(settings, "openrouter"), "sk-or-env");
  });
});

test("a blank stored key is treated as absent", () => {
  withEnv({ [OPENROUTER_ENV]: undefined }, () => {
    const settings = settingsWith((draft) => {
      draft.llm.provider = "openrouter";
      draft.llm.apiKey = "   ";
    });
    assert.equal(apiKeyForProvider(settings, "openrouter"), undefined);
  });
});
