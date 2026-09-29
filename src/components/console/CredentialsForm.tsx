"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { JsonBlock } from "./JsonBlock";
import type { AuthStatus } from "@/lib/kit/types";

export type CredentialsView = {
  path: string;
  present: boolean;
  modeSecure: boolean | null;
  fields: Array<{ name: string; set: boolean }>;
};

export function CredentialsForm({ initial, auth }: { initial: CredentialsView; auth: AuthStatus | null }) {
  const router = useRouter();
  const [privateKey, setPrivateKey] = useState("");
  const [accountIndex, setAccountIndex] = useState(
    auth?.account_index != null ? String(auth.account_index) : "",
  );
  const [apiKeyIndex, setApiKeyIndex] = useState(
    auth?.api_key_index != null ? String(auth.api_key_index) : "",
  );
  const [busy, setBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const keySet = initial.fields.find((f) => f.name === "LIGHTER_API_PRIVATE_KEY")?.set ?? false;

  async function call(action: "save" | "clear") {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/credentials", {
        method: action === "save" ? "PUT" : "DELETE",
        ...(action === "save"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                ...(privateKey.trim() ? { privateKey: privateKey.trim() } : {}),
                ...(accountIndex.trim() ? { accountIndex: Number(accountIndex) } : {}),
                ...(apiKeyIndex.trim() ? { apiKeyIndex: Number(apiKeyIndex) } : {}),
              }),
            }
          : {}),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setNotice({ tone: "error", text: data.detail ?? data.error ?? "request failed" });
        return;
      }
      setPrivateKey("");
      setNotice({
        tone: "ok",
        text: action === "save" ? "Credentials written." : "Credentials removed.",
      });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-body text-ink">
          {keySet ? (
            <span className="text-positive">A private key is present.</span>
          ) : (
            <span className="text-ink-muted">No private key stored yet.</span>
          )}{" "}
          {auth?.auth_capable ? (
            <span className="text-positive">Live reads and writes resolve.</span>
          ) : (
            <span className="text-ink-muted">
              Live reads and writes are unavailable{auth?.missing.length ? ` — missing ${auth.missing.join(", ")}` : ""}.
            </span>
          )}
        </p>
        <p className="text-body-sm text-ink-muted">
          Written to{" "}
          <code className="font-mono text-body-xs text-ink-subtle">{initial.path}</code> with owner-only
          permissions. The value is never stored in this project&apos;s database and never sent back to the
          browser. Create a key at{" "}
          <a
            className="text-ink underline underline-offset-2"
            href="https://app.lighter.xyz/apikeys"
            target="_blank"
            rel="noreferrer"
          >
            app.lighter.xyz/apikeys
          </a>
          .
        </p>
        {initial.present && initial.modeSecure === false ? (
          <p className="border border-line bg-tint-yellow/40 p-3 text-body-xs text-ink">
            The file is readable by other users. Fix it with{" "}
            <code className="font-mono">chmod 600 {initial.path}</code>.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Private key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={keySet ? "stored — type to replace" : "0x…"}
          value={privateKey}
          onChange={(event) => setPrivateKey(event.target.value)}
          hint="0x-prefixed 32-byte hex. Leave empty to keep the stored key."
          className="md:col-span-2"
        />
        <TextField
          label="Account index"
          inputMode="numeric"
          placeholder="0"
          value={accountIndex}
          onChange={(event) => setAccountIndex(event.target.value)}
          hint="Which sub-account the key trades against."
        />
        <TextField
          label="API key index"
          inputMode="numeric"
          placeholder="0"
          value={apiKeyIndex}
          onChange={(event) => setApiKeyIndex(event.target.value)}
          hint="The key id created in the dashboard."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" disabled={busy} onClick={() => call("save")}>
          Save credentials
        </Button>
        {initial.present ? (
          confirmingClear ? (
            <>
              <span className="text-body-xs text-ink">
                Delete the stored key? This cannot be undone.
              </span>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  setConfirmingClear(false);
                  void call("clear");
                }}
              >
                Yes, delete it
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmingClear(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="danger" onClick={() => setConfirmingClear(true)}>
              Clear
            </Button>
          )
        ) : null}
        {notice ? (
          <span className={`text-body-xs ${notice.tone === "ok" ? "text-positive" : "text-negative"}`}>
            {notice.text}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-label-sm uppercase tracking-[0.02em] text-ink-muted">
          Kit auth status
        </p>
        <JsonBlock
          value={auth ?? { note: "the kit is not installed or not responding" }}
        />
      </div>
    </div>
  );
}
