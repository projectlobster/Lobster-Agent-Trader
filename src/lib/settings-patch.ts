import type { Settings } from "@/lib/store/settings";

export type SettingsDraft = Omit<Settings, "llm"> & {
  llm: Settings["llm"] & { apiKeySet: boolean };
  kit: Settings["kit"] & { python: string };
};

export type SettingsPatchInput = {
  draft: SettingsDraft;
  /** The key typed into the form (empty when untouched). */
  apiKey: string;
  apiKeyDirty: boolean;
  watchlistText: string;
  allowedSymbolsText: string;
};

export function parseSymbolList(text: string): string[] {
  return text
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Build the PUT body for /api/settings.
 *
 * This is a pure function on purpose: an earlier version hand-assembled the
 * `llm` object field by field and silently dropped `reasoningEffort` and
 * `jsonMode`, so those controls reported "saved" while discarding the change.
 * Keeping it testable is what stops that from coming back.
 */
export function buildSettingsPatch(input: SettingsPatchInput): Record<string, unknown> {
  const { draft, apiKey, apiKeyDirty, watchlistText, allowedSymbolsText } = input;

  // apiKeySet is a read-only view field, and the stored apiKey must never be
  // echoed back — sending it would overwrite the saved key with the placeholder.
  const { apiKeySet: _apiKeySet, apiKey: _storedApiKey, ...llm } = draft.llm;

  return {
    llm: {
      ...llm,
      ...(apiKeyDirty ? { apiKey } : {}),
    },
    budget: draft.budget,
    kit: draft.kit,
    agent: { ...draft.agent, watchlist: parseSymbolList(watchlistText) },
    risk: { ...draft.risk, allowedSymbols: parseSymbolList(allowedSymbolsText) },
    paper: draft.paper,
  };
}
