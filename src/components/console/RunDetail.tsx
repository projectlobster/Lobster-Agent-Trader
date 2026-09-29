"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/Label";
import { JsonBlock } from "./JsonBlock";
import { shortDateTime } from "@/lib/format";

type RunDetailPayload = {
  run: {
    id: string;
    status: string;
    mode: string;
    action: string | null;
    symbol: string | null;
    started_at: string;
    finished_at: string | null;
    tokens_input: number;
    tokens_output: number;
    cost_usd: number;
    latency_ms: number | null;
    error: string | null;
    stop_reason: string | null;
    decision: unknown;
    snapshot: unknown;
    trace: unknown;
    order: unknown;
  };
  llmCalls: Array<{
    id: number;
    attempt: number;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    latency_ms: number;
  }>;
};

export function RunDetail({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const [payload, setPayload] = useState<RunDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!runId) {
      setPayload(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/runs?id=${encodeURIComponent(runId)}`)
      .then((response) => response.json())
      .then((data: RunDetailPayload & { error?: string }) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setPayload(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const run = payload?.run;

  return (
    <Modal
      open={runId !== null}
      onClose={onClose}
      title={run ? `run ${run.id.slice(0, 8)} · ${run.status}` : "run detail"}
      width="max-w-4xl"
    >
      {loading ? <p className="text-body text-ink-muted">Loading…</p> : null}
      {error ? <p className="text-body text-negative">{error}</p> : null}

      {run ? (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Field label="Started" value={shortDateTime(run.started_at)} />
            <Field label="Mode" value={run.mode} />
            <Field
              label="Tokens"
              value={`${(run.tokens_input + run.tokens_output).toLocaleString("en-US")} (in ${run.tokens_input.toLocaleString("en-US")} / out ${run.tokens_output.toLocaleString("en-US")})`}
            />
            <Field label="Cost" value={`$${run.cost_usd.toFixed(4)}`} />
            <Field label="Action" value={run.action ?? "—"} />
            <Field label="Symbol" value={run.symbol ?? "—"} />
            <Field label="Latency" value={run.latency_ms === null ? "—" : `${run.latency_ms} ms`} />
            <Field label="Stop reason" value={run.stop_reason ?? "—"} />
          </dl>

          {run.error ? (
            <div className="border border-negative/40 bg-negative/5 p-3">
              <Label>Blocked / error</Label>
              <p className="mt-1.5 text-body-sm text-ink">{run.error}</p>
            </div>
          ) : null}

          <Block label="Decision">
            <JsonBlock value={run.decision ?? null} />
          </Block>

          {payload && payload.llmCalls.length > 0 ? (
            <Block label="LLM calls">
              <JsonBlock value={payload.llmCalls} maxHeight={200} />
            </Block>
          ) : null}

          <Block label="Trace">
            <JsonBlock value={run.trace ?? null} maxHeight={240} />
          </Block>

          <Block label="Order">
            <JsonBlock value={run.order ?? null} maxHeight={200} />
          </Block>

          <Block label="Market snapshot given to the model">
            <JsonBlock value={run.snapshot ?? null} maxHeight={360} />
          </Block>
        </div>
      ) : null}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-label-sm uppercase text-ink-muted">{label}</dt>
      <dd className="tabular font-mono text-mono-xs break-all text-ink">{value}</dd>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-ink-subtle">{label}</Label>
      {children}
    </div>
  );
}
