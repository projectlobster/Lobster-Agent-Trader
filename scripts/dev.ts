import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { loadDotEnv } from "@/lib/load-env";

loadDotEnv();

const PREFERRED_PORTS = [3210, 3211, 3212, 3213, 3214, 3220, 3230, 3300, 3400, 3500, 4000];

/**
 * The probe has to bind the same address the server will. Probing 0.0.0.0
 * reports "free" for a port that is already taken on 127.0.0.1, and since this
 * script always passes an explicit -p, Next will not retry another port — it
 * would just fail to start. That is the exact confusion this probing exists to
 * prevent, so the two must agree.
 */
function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, host);
  });
}

function requestedPort(args: string[]): number | null {
  const index = args.findIndex((arg) => arg === "-p" || arg === "--port");
  if (index === -1) return null;
  const value = Number(args[index + 1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function requestedHost(args: string[]): string | null {
  const index = args.findIndex((arg) => arg === "-H" || arg === "--hostname");
  if (index === -1) return null;
  const value = args[index + 1];
  return value && !value.startsWith("-") ? value : null;
}

async function pickPort(host: string): Promise<number> {
  for (const candidate of PREFERRED_PORTS) {
    if (await isPortFree(candidate, host)) return candidate;
  }
  // Last resort: let the OS hand us one.
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const subcommand =
    args[0] === "dev" || args[0] === "start" ? args.shift()! : "dev";
  const explicit = requestedPort(args);

  // Nothing in this app is authenticated per user, so the safe default is to
  // stay on loopback. Exposing it is a deliberate act: pass -H, and set
  // LIGHTER_TRADER_PASSWORD plus a TLS proxy before you do.
  const requested = requestedHost(args);
  const host = requested ?? "127.0.0.1";

  const port = explicit ?? (await pickPort(host));

  const passthrough = [...args];
  if (!requested) passthrough.push("--hostname", host);

  if (explicit === null) {
    // Port 3000 is the conventional default, but on a machine that already runs
    // other apps (and macOS happily lets two processes share a port) that leads
    // to requests being served by the wrong app. Probing avoids the whole class
    // of "why does /console 404" confusion.
    console.log(`\n  Lobster Agent Trader  →  http://${host}:${port}/console\n`);
  } else {
    console.log(`\n  Lobster Agent Trader  →  http://${host}:${port}/console  (explicit)\n`);
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.log(
      `  ! bound to ${host} — set LIGHTER_TRADER_PASSWORD and use HTTPS before exposing this\n`,
    );
  }

  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next");

  const child = spawn(
    process.execPath,
    [nextBin, subcommand, "-p", String(port), ...passthrough],
    { stdio: "inherit", env: process.env },
  );

  const forward = (signal: NodeJS.Signals) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));

  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 0));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
