"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { SelectField, TextField, Toggle } from "@/components/ui/Field";
import { JsonBlock } from "./JsonBlock";
import type { Settings } from "@/lib/store/settings";
import type { AuthStatus } from "@/lib/kit/types";
import type { ModelPrice } from "@/lib/llm/pricing";
import { buildSettingsPatch, type SettingsDraft } from "@/lib/settings-patch";

export type SettingsView = SettingsDraft;

export type CatalogModel = {
  id: string;
  name: string;
  contextLength: number | null;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  free: boolean;
  textOnly: boolean;
};

type TestResult = {
  ok: boolean;
  detail?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
};

export type KitHealth = {
  installed: boolean;
  dir: string | null;
  python: string;
  sdkVendored: boolean;
  health?: { status: string; version: string } | null;
  healthError?: string | null;
  auth?: AuthStatus | null;
  authError?: string | null;
  system?: unknown;
};

export function SettingsForm({
  initial,
  models,
  hosts,
  kit,
  envLiveEnabled,
  envPinned,
  initialWarnings,
}: {
  initial: SettingsView;
  models: ModelPrice[];
  hosts: Array<{ id: string; label: string; url: string }>;
  kit: KitHealth;
  envLiveEnabled: boolean;
  envPinned: string[];
  initialWarnings: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<SettingsView>(initial);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [watchlist, setWatchlist] = useState(initial.agent.watchlist.join(", "));
  const [allowed, setAllowed] = useState(initial.risk.allowedSymbols.join(", "));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [lintWarnings, setLintWarnings] = useState<string[]>(initialWarnings);

  const patch = (updater: (next: SettingsView) => SettingsView) =>
    setDraft((current) => updater(structuredClone(current)));

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const body = buildSettingsPatch({
        draft,
        apiKey,
        apiKeyDirty,
        watchlistText: watchlist,
        allowedSymbolsText: allowed,
      });

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        error?: string;
        settings?: SettingsView;
        warnings?: string[];
      };

      if (!response.ok) {
        setNotice({ tone: "error", text: data.error ?? `request failed (${response.status})` });
        return;
      }

      if (data.settings) setDraft((current) => ({ ...current, ...data.settings }));
      setLintWarnings(data.warnings ?? []);
      setApiKey("");
      setApiKeyDirty(false);
      setNotice({ tone: "ok", text: "settings saved" });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const providerModels = models.filter((model) => model.provider === draft.llm.provider);

  useEffect(() => {
    if (draft.llm.provider !== "openrouter") return;
    let cancelled = false;
    setCatalogLoading(true);
    fetch("/api/models", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { models?: CatalogModel[] }) => {
        if (!cancelled) setCatalog(data.models ?? []);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.llm.provider]);

  const catalogOptions =
    draft.llm.provider === "openrouter"
      ? [
          ...catalog
            .filter((entry) => entry.free)
            .slice(0, 80)
            .map((entry) => ({
              value: entry.id,
              label: `${entry.name} · free${entry.contextLength ? ` · ${Math.round(entry.contextLength / 1000)}k ctx` : ""}`,
            })),
          ...(catalog.some((entry) => entry.id === draft.llm.model)
            ? []
            : [{ value: draft.llm.model, label: `${draft.llm.model} (current)` }]),
        ]
      : providerModels.map((model) => ({
          value: model.model,
          label: `${model.model} — $${model.inputPerMillion} in / $${model.outputPerMillion} out per 1M`,
        }));

  const catalogFreeCount = catalog.filter((entry) => entry.free).length;

  const testModel = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/models/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as TestResult & { error?: string };
      if (!response.ok) {
        setTestResult({ ok: false, detail: data.error ?? `HTTP ${response.status}` });
      } else {
        setTestResult({
          ok: data.ok,
          detail: data.detail,
          model: data.model,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          costUsd: data.costUsd,
          latencyMs: data.latencyMs,
        });
      }
    } catch (error) {
      setTestResult({ ok: false, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label>Configuration</Label>
          <p className="text-body text-ink-muted">
            Keys are written only to the local SQLite file (<span className="font-mono">data/</span>)
            and the API never echoes them back. Environment variables take precedence over anything
            stored here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {notice ? (
            <span
              className={`font-mono text-label-sm uppercase ${
                notice.tone === "error" ? "text-negative" : "text-positive"
              }`}
            >
              {notice.text}
            </span>
          ) : null}
          <Button variant="secondary" onClick={() => void testModel()} disabled={testing}>
            {testing ? "Testing…" : "Test model"}
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>

      {testResult ? (
        <div
          className={`border p-4 ${
            testResult.ok ? "border-positive/40 bg-positive/5" : "border-negative/40 bg-negative/5"
          }`}
        >
          <Label className={testResult.ok ? "text-positive" : "text-negative"}>
            {testResult.ok ? "model responded" : "model test failed"}
          </Label>
          <p className="mt-2 font-mono text-mono-xs break-all text-ink">
            {testResult.ok ? (
              <>
                {testResult.model} · in {testResult.inputTokens} / out {testResult.outputTokens} tok ·
                cost ${(testResult.costUsd ?? 0).toFixed(6)} · {testResult.latencyMs} ms
              </>
            ) : (
              testResult.detail
            )}
          </p>
          {!testResult.ok ? (
            <p className="mt-2 text-body-xs text-ink-subtle">
              Changes have to be saved before the test picks them up. If a free OpenRouter endpoint
              reports “guardrail restrictions”, the endpoint has to be allowed in your OpenRouter
              account's privacy settings.
            </p>
          ) : null}
        </div>
      ) : null}

      {lintWarnings.length > 0 ? (
        <div className="border border-line bg-tint-yellow/40 p-4">
          <Label>Configuration checks</Label>
          <ul className="mt-2 flex flex-col gap-1.5">
            {lintWarnings.map((warning) => (
              <li key={warning} className="text-body-sm text-ink">
                · {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Group title="Model & credentials" label="LLM">
        {envPinned.length > 0 ? (
          <p className="border border-line bg-tint-yellow/50 p-3 text-body-xs text-ink md:col-span-2">
            <span className="font-mono uppercase">pinned by environment</span>:{" "}
            {envPinned.join(", ")} — values in .env.local win, so changes made here have no effect.
            Edit the environment or remove them from .env.local.
          </p>
        ) : null}
        <SelectField
          label="Provider"
          value={draft.llm.provider}
          onChange={(event) =>
            patch((next) => {
              next.llm.provider = event.target.value as Settings["llm"]["provider"];
              const first = models.find((model) => model.provider === next.llm.provider);
              if (first) next.llm.model = first.model;
              return next;
            })
          }
        >
          <option value="openrouter">openrouter</option>
          <option value="anthropic">anthropic</option>
          <option value="openai">openai</option>
        </SelectField>

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2">
            <span className="font-mono text-label-sm uppercase tracking-[0.02em] text-ink-muted">
              Model
            </span>
            <input
              list="lt-model-options"
              className="w-full rounded-button border border-line-control bg-canvas px-3 py-2 font-mono text-body-sm text-ink outline-none transition-colors focus:border-ink"
              value={draft.llm.model}
              onChange={(event) =>
                patch((next) => {
                  next.llm.model = event.target.value;
                  return next;
                })
              }
            />
            <datalist id="lt-model-options">
              {catalogOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </datalist>
          </label>
          <p className="text-body-xs text-ink-subtle">
            {draft.llm.provider === "openrouter"
              ? catalogLoading
                ? "Loading the live OpenRouter catalogue…"
                : `${catalogFreeCount} free models available · any OpenRouter model id is accepted`
              : "Prices come from the local table; update it if the provider changes them."}
          </p>
        </div>

        <SelectField
          label="Reasoning effort"
          value={draft.llm.reasoningEffort}
          onChange={(event) =>
            patch((next) => {
              next.llm.reasoningEffort = event.target.value as Settings["llm"]["reasoningEffort"];
              return next;
            })
          }
          hint="Reasoning models spend output tokens thinking before they answer. “off” or “low” keeps them inside the cycle budget; measured, “off” cost ~3.1k tokens/cycle but produced schema-invalid output 1 run in 4."
        >
          {["off", "low", "medium", "high"].map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </SelectField>

        <div className="flex items-center pt-6">
          <Toggle
            label="JSON response mode"
            hint="Sends response_format=json_object. Many OpenRouter free endpoints reject it with HTTP 400 — leave off unless the model documents support."
            checked={draft.llm.jsonMode}
            onChange={(value) =>
              patch((next) => {
                next.llm.jsonMode = value;
                return next;
              })
            }
          />
        </div>

        <TextField
          label="API key"
          type="password"
          value={apiKey}
          placeholder={draft.llm.apiKeySet ? "••••••• already set — leave blank to keep" : "paste key"}
          onChange={(event) => {
            setApiKey(event.target.value);
            setApiKeyDirty(true);
          }}
          hint={
            draft.llm.apiKeySet
              ? "A key is already available (env or stored). Typing here replaces the stored value."
              : "No key configured yet — the agent cannot run a cycle without one."
          }
        />

        <TextField
          label="Max output tokens per call"
          type="number"
          min={128}
          max={8000}
          value={draft.llm.maxOutputTokens}
          onChange={(event) =>
            patch((next) => {
              next.llm.maxOutputTokens = Number(event.target.value);
              return next;
            })
          }
        />
      </Group>

      <Group title="Token allowance" label="Budget">
        <TextField
          label="Monthly token budget"
          type="number"
          min={0}
          value={draft.budget.monthlyTokens}
          onChange={(event) =>
            patch((next) => {
              next.budget.monthlyTokens = Number(event.target.value);
              return next;
            })
          }
          hint="What your plan gives you each month, in tokens."
        />
        <TextField
          label="Reserved for normal work"
          type="number"
          min={0}
          value={draft.budget.reservedForWork}
          onChange={(event) =>
            patch((next) => {
              next.budget.reservedForWork = Number(event.target.value);
              return next;
            })
          }
          hint="The part you will genuinely spend on non-trading work. Only the remainder is tradable."
        />
        <TextField
          label="Period reset day"
          type="number"
          min={1}
          max={28}
          value={draft.budget.resetDay}
          onChange={(event) =>
            patch((next) => {
              next.budget.resetDay = Number(event.target.value);
              return next;
            })
          }
        />
        <div className="flex items-center pt-6">
          <Toggle
            label="Carry over unused allowance"
            hint="Leftover allowance rolls into next period's tradable budget."
            checked={draft.budget.carryOverLeftover}
            onChange={(value) =>
              patch((next) => {
                next.budget.carryOverLeftover = value;
                return next;
              })
            }
          />
        </div>
      </Group>

      <Group title="Market inputs" label="Agent">
        <TextField
          label="Watchlist (comma separated perp tickers)"
          value={watchlist}
          onChange={(event) => setWatchlist(event.target.value)}
          hint="These are the markets the model is shown each cycle."
        />
        <TextField
          label="Interval seconds"
          type="number"
          min={15}
          value={draft.agent.intervalSeconds}
          onChange={(event) =>
            patch((next) => {
              next.agent.intervalSeconds = Number(event.target.value);
              return next;
            })
          }
        />
        <SelectField
          label="Candle resolution"
          value={draft.agent.candleResolution}
          onChange={(event) =>
            patch((next) => {
              next.agent.candleResolution = event.target.value;
              return next;
            })
          }
        >
          {["1m", "5m", "15m", "30m", "1h", "4h", "1d"].map((resolution) => (
            <option key={resolution} value={resolution}>
              {resolution}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Candles per symbol"
          type="number"
          min={2}
          max={200}
          value={draft.agent.candleCountBack}
          onChange={(event) =>
            patch((next) => {
              next.agent.candleCountBack = Number(event.target.value);
              return next;
            })
          }
        />
      </Group>

      <Group title="Risk limits" label="Guardrails">
        <TextField
          label="Allowed symbols"
          value={allowed}
          onChange={(event) => setAllowed(event.target.value)}
        />
        <TextField
          label="Max notional per order (USD)"
          type="number"
          min={1}
          value={draft.risk.maxNotionalUsd}
          onChange={(event) =>
            patch((next) => {
              next.risk.maxNotionalUsd = Number(event.target.value);
              return next;
            })
          }
        />
        <TextField
          label="Max account leverage"
          type="number"
          min={1}
          max={5}
          step={0.5}
          value={draft.risk.maxLeverage}
          onChange={(event) =>
            patch((next) => {
              next.risk.maxLeverage = Number(event.target.value);
              return next;
            })
          }
        />
        <TextField
          label="Max open positions"
          type="number"
          min={0}
          max={20}
          value={draft.risk.maxOpenPositions}
          onChange={(event) =>
            patch((next) => {
              next.risk.maxOpenPositions = Number(event.target.value);
              return next;
            })
          }
        />
        <TextField
          label="Cycles per day"
          type="number"
          min={1}
          max={288}
          value={draft.risk.maxCyclesPerDay}
          onChange={(event) =>
            patch((next) => {
              next.risk.maxCyclesPerDay = Number(event.target.value);
              return next;
            })
          }
        />
        <TextField
          label="Cooldown seconds"
          type="number"
          min={0}
          value={draft.risk.cooldownSeconds}
          onChange={(event) =>
            patch((next) => {
              next.risk.cooldownSeconds = Number(event.target.value);
              return next;
            })
          }
        />
        <TextField
          label="Minimum confidence (0–1)"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={draft.risk.minConfidence}
          onChange={(event) =>
            patch((next) => {
              next.risk.minConfidence = Number(event.target.value);
              return next;
            })
          }
        />
        <TextField
          label="Daily loss limit (USD)"
          type="number"
          min={1}
          value={draft.risk.dailyLossLimitUsd}
          onChange={(event) =>
            patch((next) => {
              next.risk.dailyLossLimitUsd = Number(event.target.value);
              return next;
            })
          }
          hint="Reaching this stops the engine, not just the next order."
        />
      </Group>

      <Group title="Lighter agent kit" label="Kit">
        <div className="flex flex-col gap-3 md:col-span-2">
          <div className="flex flex-col gap-2 border border-line bg-canvas p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`size-2.5 ${kit.installed ? "bg-positive" : "bg-negative"}`}
              />
              <span className="font-mono text-label-sm uppercase text-ink">
                {kit.installed ? "kit installed" : "kit not installed"}
              </span>
              <span className="font-mono text-mono-xs text-ink-subtle">
                {kit.health ? `v${kit.health.version}` : (kit.healthError ?? "no health response")}
              </span>
            </div>
            <p className="font-mono text-mono-xs break-all text-ink-muted">
              dir: {kit.dir ?? "not found"}
            </p>
            <p className="font-mono text-mono-xs text-ink-muted">
              python: {kit.python} · SDK vendored locally:{" "}
              {kit.sdkVendored ? "yes" : "no (uses an existing install, or vendors on first call)"}
            </p>
            {kit.auth ? (
              <p className="font-mono text-mono-xs text-ink-muted">
                auth_capable: {String(kit.auth.auth_capable)} · host: {kit.auth.host}
                {kit.auth.missing.length > 0 ? ` · missing: ${kit.auth.missing.join(", ")}` : ""}
                {kit.auth.credentials_file.present
                  ? ` · credentials ${kit.auth.credentials_file.mode_secure === false ? "mode too open" : "mode ok"}`
                  : " · no credentials file"}
              </p>
            ) : (
              <p className="font-mono text-mono-xs text-ink-subtle">
                {kit.authError ?? "auth status unavailable"}
              </p>
            )}
          </div>
          <p className="text-body-xs text-ink-subtle">
            If it is not installed, run <span className="font-mono">npm run setup</span>, or clone it
            to
            <span className="font-mono"> ~/.agents/skills/lighter-agent-kit</span>, or point
            <span className="font-mono"> LIGHTER_AGENT_KIT_DIR</span> at it below.
          </p>
        </div>

        <SelectField
          label="Deployment"
          value={draft.kit.host}
          onChange={(event) =>
            patch((next) => {
              next.kit.host = event.target.value;
              return next;
            })
          }
        >
          {hosts.map((host) => (
            <option key={host.id} value={host.url}>
              {host.label}
            </option>
          ))}
          {hosts.every((host) => host.url !== draft.kit.host) ? (
            <option value={draft.kit.host}>{draft.kit.host} (custom)</option>
          ) : null}
        </SelectField>

        <TextField
          label="Paper state path"
          value={draft.kit.paperStatePath}
          onChange={(event) =>
            patch((next) => {
              next.kit.paperStatePath = event.target.value;
              return next;
            })
          }
          hint="Relative paths resolve against the project root. Empty uses the kit's default in ~/.lighter."
        />

        <TextField
          label="Python interpreter"
          value={draft.kit.python}
          onChange={(event) =>
            patch((next) => {
              next.kit.python = event.target.value;
              return next;
            })
          }
          hint="Leave as python3 unless the kit lives in a virtualenv."
        />

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label className="text-ink-subtle">Live trading switch</Label>
          <p className="text-body-sm text-ink-muted">
            <span className="font-mono">LIGHTER_ENABLE_LIVE</span> is currently{" "}
            <span className="font-mono">{envLiveEnabled ? "1" : "0"}</span>.
            {envLiveEnabled
              ? " The server allows live, but the mode still only changes after the confirmation on the Agent page."
              : " It has to be set in .env.local before live can be enabled."}
          </p>
        </div>
      </Group>

      <Group title="Paper account defaults" label="Paper">
        <TextField
          label="Initial collateral (USD)"
          type="number"
          min={1}
          value={draft.paper.initialCollateral}
          onChange={(event) =>
            patch((next) => {
              next.paper.initialCollateral = Number(event.target.value);
              return next;
            })
          }
        />
        <SelectField
          label="Fee tier"
          value={draft.paper.tier}
          onChange={(event) =>
            patch((next) => {
              next.paper.tier = event.target.value;
              return next;
            })
          }
        >
          {[
            "standard",
            "premium",
            "premium_1",
            "premium_2",
            "premium_3",
            "premium_4",
            "premium_5",
            "premium_6",
            "premium_7",
          ].map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </SelectField>
      </Group>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <details className="border border-line bg-surface p-4">
        <summary className="cursor-pointer font-mono text-label-sm uppercase text-ink-muted">
          Raw settings payload
        </summary>
        <div className="mt-3">
          <JsonBlock value={{ ...draft, llm: { ...draft.llm, apiKey: "[redacted]" } }} />
        </div>
      </details>
    </div>
  );
}

function Group({
  title,
  label,
  description,
  children,
}: {
  title: string;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  // Mirrors the `Card` / `Section` header used everywhere else: a muted mono
  // label above the title. An accent-coloured <legend> sitting on the border
  // was the one heading style on the site that looked like nothing else.
  return (
    <section className="flex flex-col gap-4 border border-line bg-surface p-5">
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <h3 className="text-card-title text-ink">{title}</h3>
        {description ? (
          <p className="max-w-[46rem] text-body-xs text-ink-subtle">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
