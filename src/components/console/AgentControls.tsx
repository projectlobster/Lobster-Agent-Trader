"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Field";
import { JsonBlock } from "./JsonBlock";
import { shortDateTime, relativeTime } from "@/lib/format";

export type EngineStatusView = {
  running: boolean;
  ticking: boolean;
  stale: boolean;
  mode: "paper" | "live";
  intervalSeconds: number;
  startedAt: string | null;
  lastTickAt: string | null;
  lastError: string | null;
  stopReason: string | null;
  lease: { owner: string | null; expiresAt: string | null };
};

type Notice = { tone: "ok" | "error" | "info"; text: string };

export function AgentControls({
  initialEngine,
  envLiveEnabled,
  liveEnabled,
  paperCollateral,
  paperTier,
  maxNotionalUsd,
}: {
  initialEngine: EngineStatusView;
  envLiveEnabled: boolean;
  liveEnabled: boolean;
  paperCollateral: number;
  paperTier: string;
  maxNotionalUsd: number;
}) {
  const router = useRouter();
  const [engine, setEngine] = useState(initialEngine);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [runResult, setRunResult] = useState<unknown>(null);
  const [intervalSeconds, setIntervalSeconds] = useState(initialEngine.intervalSeconds);
  const [collateral, setCollateral] = useState(String(paperCollateral));
  const [liveModal, setLiveModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [closePreview, setClosePreview] = useState<unknown>(null);

  const refreshEngine = useCallback(async () => {
    try {
      const response = await fetch("/api/engine", { cache: "no-store" });
      const data = (await response.json()) as { engine?: EngineStatusView };
      if (data.engine) setEngine(data.engine);
    } catch {
      // Polling is best-effort.
    }
  }, []);

  useEffect(() => {
    if (!engine.running) return;
    const timer = setInterval(() => {
      void refreshEngine();
    }, 5_000);
    return () => clearInterval(timer);
  }, [engine.running, refreshEngine]);

  const call = useCallback(
    async (key: string, run: () => Promise<Response>) => {
      setBusy(key);
      setNotice(null);
      try {
        const response = await run();
        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          setNotice({
            tone: "error",
            text: typeof data.error === "string" ? data.error : `request failed (${response.status})`,
          });
          return null;
        }
        return data;
      } catch (error) {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const runOnce = () =>
    call("decide", () =>
      fetch("/api/decide", { method: "POST" }),
    ).then((data) => {
      if (!data) return;
      setRunResult(data);
      const status = typeof data.status === "string" ? data.status : "unknown";
      const detail =
        typeof data.error === "string"
          ? data.error
          : typeof data.stopReason === "string"
            ? data.stopReason
            : typeof data.decision === "object" && data.decision
              ? `action=${(data.decision as { action?: string }).action}`
              : "completed";
      setNotice({
        tone: status === "error" ? "error" : status === "blocked" ? "info" : "ok",
        text: `${status} · ${detail}`,
      });
      void refreshEngine();
      router.refresh();
    });

  const startEngine = () =>
    call("start", () =>
      fetch("/api/engine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", intervalSeconds }),
      }),
    ).then((data) => {
      if (!data) return;
      setEngine(data.engine as EngineStatusView);
      setNotice({ tone: "ok", text: "engine started" });
      router.refresh();
    });

  const stopEngine = () =>
    call("stop", () =>
      fetch("/api/engine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      }),
    ).then((data) => {
      if (!data) return;
      setEngine(data.engine as EngineStatusView);
      setNotice({ tone: "info", text: "engine stopped" });
      router.refresh();
    });

  const paperAction = (action: "init" | "reset") =>
    call(`paper-${action}`, () =>
      fetch("/api/paper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, collateral: Number(collateral), tier: paperTier }),
      }),
    ).then((data) => {
      if (!data) return;
      setNotice({
        tone: "ok",
        text:
          action === "init"
            ? "paper account created"
            : "paper account reset — positions and collateral cleared, and the equity series restarted (the decision log is kept)",
      });
      router.refresh();
    });

  const setMode = (mode: "paper" | "live", enabled: boolean) =>
    call("mode", () =>
      fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, liveEnabled: enabled }),
      }),
    ).then((data) => {
      if (!data) return;
      setNotice({
        tone: mode === "live" ? "error" : "ok",
        text: mode === "live" ? "engine switched to LIVE" : "engine switched to paper",
      });
      setLiveModal(false);
      setConfirmText("");
      void refreshEngine();
      router.refresh();
    });

  const doCloseAll = async (preview: boolean) => {
    const data = await call(preview ? "close-preview" : "close-all", () =>
      fetch("/api/close-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(preview ? { preview: true } : { confirm: "CLOSE ALL" }),
      }),
    );
    if (!data) return;
    if (preview) {
      setClosePreview(data.preview ?? null);
      setNotice({ tone: "info", text: "preview ready — review before executing" });
    } else {
      setClosePreview(null);
      const note = typeof data.note === "string" ? ` ${data.note}` : "";
      setNotice({ tone: "error", text: `close_all was broadcast; verify positions.${note}` });
      setRunResult(data);
      // The route stops the engine for the close, and restarts it if the
      // broadcast failed — so the local view is stale either way.
      void refreshEngine();
      router.refresh();
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-5 border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Agent engine</Label>
            <p className="flex items-center gap-2 text-card-title text-ink">
              <span
                aria-hidden
                className={`size-2.5 ${engine.running ? "animate-blink bg-positive" : "bg-ink-subtle"}`}
              />
              {engine.running ? "Running" : "Stopped"}
              <span className="font-mono text-label-sm uppercase text-ink-muted">
                {engine.mode}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 font-mono text-mono-xs text-ink-subtle">
            <span>{engine.ticking ? "cycle in flight…" : `every ${engine.intervalSeconds}s`}</span>
            <span>last tick {engine.lastTickAt ? relativeTime(engine.lastTickAt) : "never"}</span>
          </div>
        </div>

        <p className="text-body-xs text-ink-subtle">
          This timer lives inside the Next server process, so a restart kills it. For genuinely
          unattended running use
          <span className="font-mono"> npm run engine</span>; both share one cycle lease, so they
          never submit orders at the same time.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => void startEngine()}
            disabled={busy !== null || engine.running}
          >
            {busy === "start" ? "Starting…" : "Start engine"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void stopEngine()}
            disabled={busy !== null || !engine.running}
          >
            {busy === "stop" ? "Stopping…" : "Stop engine"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void runOnce()}
            disabled={busy !== null || engine.ticking}
          >
            {busy === "decide" ? "Deciding…" : "Run once"}
          </Button>
          <TextField
            label="Interval (s)"
            type="number"
            min={15}
            value={intervalSeconds}
            onChange={(event) => setIntervalSeconds(Number(event.target.value))}
          />
        </div>

        {engine.stale ? (
          <p className="border border-negative/40 bg-negative/5 p-3 text-body-xs text-negative">
            This process's timer has not produced a decision in three intervals — usually a server
            restart, or several workers where only one holds the timer. For unattended running,
            switch to
            <span className="font-mono"> npm run engine</span>, which shares the same cycle lease as
            this page.
          </p>
        ) : null}

        {engine.lease.owner ? (
          <p className="border border-line bg-canvas p-3 font-mono text-mono-xs text-ink-muted">
            cycle lease held by <span className="text-ink">{engine.lease.owner}</span>
            {engine.lease.expiresAt
              ? ` until ${shortDateTime(engine.lease.expiresAt)}`
              : ""}
          </p>
        ) : null}

        {engine.stopReason ? (
          <p className="border border-line bg-canvas p-3 font-mono text-mono-xs text-ink-muted">
            stopped because: <span className="text-ink">{engine.stopReason}</span>
          </p>
        ) : null}
        {engine.lastError ? (
          <p className="border border-negative/40 bg-negative/5 p-3 font-mono text-mono-xs text-negative">
            last error: {engine.lastError}
          </p>
        ) : null}

        {notice ? (
          <p
            className={`border p-3 text-body-sm ${
              notice.tone === "error"
                ? "border-negative/40 bg-negative/5 text-negative"
                : notice.tone === "ok"
                  ? "border-positive/40 bg-positive/5 text-ink"
                  : "border-line bg-canvas text-ink-muted"
            }`}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 border border-line bg-surface p-5">
          <div className="flex flex-col gap-1.5">
            <Label>Execution mode</Label>
            <p className="text-body text-ink-muted">
              Paper by default, so nothing reaches Lighter. Switching to live needs three things at
              once: the switch here,
              <span className="font-mono"> LIGHTER_ENABLE_LIVE=1</span> on the server, and a
              credential check before every order.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {engine.mode === "live" ? (
              <Button variant="secondary" onClick={() => void setMode("paper", false)} disabled={busy !== null}>
                Switch back to paper
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={() => setLiveModal(true)}
                disabled={busy !== null || !envLiveEnabled}
                title={envLiveEnabled ? undefined : "LIGHTER_ENABLE_LIVE is not 1 in the server environment"}
              >
                Switch to live…
              </Button>
            )}
            <span className="font-mono text-mono-xs text-ink-subtle">
              {envLiveEnabled ? "LIGHTER_ENABLE_LIVE=1" : "LIGHTER_ENABLE_LIVE is off"}
              {liveEnabled ? " · switch enabled" : " · switch disabled"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 border border-line bg-surface p-5">
          <div className="flex flex-col gap-1.5">
            <Label>Paper account</Label>
            <p className="text-body-sm text-ink-muted">
              The paper state file is kept separate from the kit default. Resetting clears the
              simulated positions and restarts the equity series.
            </p>
          </div>
          <TextField
            label="Initial collateral (USD)"
            type="number"
            min={1}
            value={collateral}
            onChange={(event) => setCollateral(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void paperAction("init")} disabled={busy !== null}>
              {busy === "paper-init" ? "Creating…" : "Init paper account"}
            </Button>
            <Button variant="secondary" onClick={() => void paperAction("reset")} disabled={busy !== null}>
              {busy === "paper-reset" ? "Resetting…" : "Reset paper account"}
            </Button>
          </div>
        </div>
      </div>

      {runResult ? (
        <div className="flex flex-col gap-2 lg:col-span-2">
          <Label className="text-ink-subtle">Last cycle output</Label>
          <JsonBlock value={runResult} maxHeight={260} />
        </div>
      ) : null}

      {closePreview ? (
        <div className="flex flex-col gap-3 border border-negative/40 bg-negative/5 p-5 lg:col-span-2">
          <Label>close_all preview</Label>
          <JsonBlock value={closePreview} maxHeight={220} />
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => void doCloseAll(false)} disabled={busy !== null}>
              {busy === "close-all" ? "Closing…" : "Execute close_all"}
            </Button>
            <Button variant="secondary" onClick={() => setClosePreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={liveModal}
        onClose={() => {
          setLiveModal(false);
          setConfirmText("");
        }}
        title="switch to live trading"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLiveModal(false);
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={confirmText.trim().toUpperCase() !== "LIVE" || busy !== null}
              onClick={() => void setMode("live", true)}
            >
              {busy === "mode" ? "Switching…" : "Enable live trading"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-ink">
            Live orders are signed and broadcast immediately and cannot be reversed. Prove the
            strategy on testnet before pointing it at real money.
          </p>
          <ul className="flex flex-col gap-2 text-body-sm text-ink-muted">
            <li>· The per-order notional cap is ${maxNotionalUsd}; anything larger is clamped rather than refused.</li>
            <li>· Only market orders are submitted; an ioc decision is rejected while live.</li>
            <li>· The engine stops itself when the daily loss limit is hit.</li>
          </ul>
          <TextField
            label='Type "LIVE" to confirm'
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="LIVE"
          />
        </div>
      </Modal>

      {engine.mode === "live" ? (
        <div className="flex flex-col gap-3 border border-negative/40 bg-surface p-5 lg:col-span-2">
          <Label>Emergency</Label>
          <p className="text-body-sm text-ink-muted">
            `close_all` flattens every open position with reduce-only market orders and cancels all
            resting orders at the same time. Look at the preview first.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void doCloseAll(true)} disabled={busy !== null}>
              {busy === "close-preview" ? "Preparing…" : "Preview close_all"}
            </Button>
          </div>
        </div>
      ) : null}

      {engine.startedAt ? (
        <p className="font-mono text-mono-xs text-ink-subtle lg:col-span-2">
          started {shortDateTime(engine.startedAt)}
        </p>
      ) : null}
    </div>
  );
}
