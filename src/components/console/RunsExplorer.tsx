"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { RunRecord } from "@/lib/store/runs";
import { compact } from "@/lib/format";
import { RunDetail } from "./RunDetail";
import { RunsTable } from "./RunsTable";

type RunsPayload = {
  runs: RunRecord[];
  period: { periodKey: string; allowanceTokens: number; usedTokens: number };
};

export function RunsExplorer({ initial }: { initial: RunsPayload }) {
  const [payload, setPayload] = useState<RunsPayload>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/runs?limit=100", { cache: "no-store" });
      const data = (await response.json()) as Partial<RunsPayload> & { error?: string };
      // Without this a rejected request (an expired password, say) would leave
      // the previous rows on screen and look like the engine had simply gone
      // quiet.
      if (!response.ok || data.error || !data.runs) {
        setError(data.error ?? `refresh failed (${response.status})`);
        return;
      }
      setError(null);
      setPayload(data as RunsPayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      void reload();
    }, 10_000);
    return () => clearInterval(timer);
  }, [auto, reload]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <div className="flex items-baseline gap-2">
            <dt className="font-mono text-label-sm uppercase text-ink-muted">Period</dt>
            <dd className="tabular font-mono text-mono-xs text-ink">{payload.period.periodKey}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="font-mono text-label-sm uppercase text-ink-muted">Tokens used</dt>
            <dd className="tabular font-mono text-mono-xs text-ink">
              {compact(payload.period.usedTokens)} / {compact(payload.period.allowanceTokens)}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="font-mono text-label-sm uppercase text-ink-muted">Runs</dt>
            <dd className="tabular font-mono text-mono-xs text-ink">{payload.runs.length}</dd>
          </div>
        </dl>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAuto((value) => !value)}>
            {auto ? "Auto-refresh on" : "Auto-refresh off"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void reload()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="border border-line bg-tint-yellow/40 p-3 text-body-xs text-ink">
          {error}
        </p>
      ) : null}

      <RunsTable runs={payload.runs} onSelect={setSelected} selectedId={selected} />
      <RunDetail runId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
