import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { authStatus, health } from "@/lib/kit/query";
import { clearKitCache, findKitDir, kitLocation, pythonBin } from "@/lib/kit/locate";
import { paperInit, paperStatus } from "@/lib/kit/paper";
import { dbPath, getDb } from "@/lib/store/db";
import { readSettings } from "@/lib/store/settings";
import { loadDotEnv } from "@/lib/load-env";

const REPO = "https://github.com/elliottech/lighter-agent-kit.git";

function heading(text: string) {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
}

function ok(text: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${text}`);
}

function warn(text: string) {
  console.log(`  \x1b[33m!\x1b[0m ${text}`);
}

function bad(text: string) {
  console.log(`  \x1b[31m✗\x1b[0m ${text}`);
}

function run(command: string, args: string[], cwd?: string) {
  return spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 5)) {
    ok(`node ${process.versions.node}`);
    return true;
  }
  bad(`node ${process.versions.node} is too old — node:sqlite needs >= 22.5`);
  return false;
}

function checkPython(): boolean {
  const python = pythonBin();
  const result = run(python, ["--version"]);
  if (result.status !== 0) {
    bad(`${python} not found — the agent kit needs Python 3.9+`);
    return false;
  }
  const version = (result.stdout || result.stderr).trim();
  ok(`${version} (${python})`);
  return true;
}

function installKit(): string | null {
  const target = resolve(process.cwd(), ".agents", "skills", "lighter-agent-kit");

  if (findKitDir()) {
    ok(`kit already present at ${findKitDir()}`);
    return findKitDir();
  }

  if (existsSync(target)) {
    warn(`${target} exists but does not look like the kit; remove it and re-run`);
    return null;
  }

  const git = run("git", ["--version"]);
  if (git.status !== 0) {
    bad("git is required to install the kit");
    return null;
  }

  mkdirSync(dirname(target), { recursive: true });
  console.log(`  cloning ${REPO} → ${target}`);
  const clone = run("git", ["clone", "--depth", "1", "--single-branch", REPO, target]);
  if (clone.status !== 0) {
    bad(`clone failed: ${(clone.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
    return null;
  }

  clearKitCache();
  const found = findKitDir();
  if (found) ok(`kit installed at ${found}`);
  else bad("clone finished but scripts/query.py is missing");
  return found;
}

function bootstrapSdk(kitDir: string): boolean {
  const python = pythonBin();
  console.log("  checking the lighter SDK (first run may pip-install into .vendor/)…");
  const result = run(python, [join("scripts", "bootstrap.py")], kitDir);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  if (result.status === 0 && output.includes('"status"')) {
    ok(output.replace(/\s+/g, " ").slice(0, 160));
    return true;
  }

  bad("the kit could not load the lighter SDK");
  if (output.length > 0) console.log(`    ${output.slice(-400)}`);
  return false;
}

function ensureDatabase() {
  const path = dbPath();
  getDb();
  ok(`database ready at ${path}`);
}

async function summarise(sdkReady: boolean) {
  const settings = readSettings();

  heading("Agent kit");
  try {
    const healthResult = await health();
    ok(`health ${healthResult.status} · v${healthResult.version}`);
  } catch (error) {
    bad(`health check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const auth = await authStatus();
    if (auth.auth_capable) {
      ok(`credentials resolved for account ${auth.account_index} on ${auth.host}`);
    } else {
      warn(`public reads and paper trading only — missing ${auth.missing.join(", ")}`);
      console.log(
        `    live writes need credentials at ${auth.credentials_file.path} (chmod 600), or env vars`,
      );
      console.log("");
      console.log("    Live trading is optional. To enable it later:");
      console.log("      1. create an API key at https://app.lighter.xyz/apikeys");
      console.log("      2. paste it into Settings → Lighter → Exchange credentials");
      console.log(`         (written to ${auth.credentials_file.path}, chmod 600, never to the database)`);
      console.log("      3. export LIGHTER_ENABLE_LIVE=1 before starting the server");
    }
  } catch (error) {
    bad(`auth status failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  heading("Paper account");
  const paperOptions = {
    host: settings.kit.host || undefined,
    statePath: settings.kit.paperStatePath || undefined,
  };

  try {
    const status = await paperStatus({ refresh: false }, paperOptions);
    ok(`paper account exists · collateral $${status.collateral.toFixed(2)} · ${status.trades_count} trades`);
  } catch {
    try {
      const created = await paperInit(
        { collateral: settings.paper.initialCollateral, tier: settings.paper.tier },
        paperOptions,
      );
      ok(`paper account initialised with $${created.collateral} (${created.tier})`);
    } catch (error) {
      warn(`could not initialise the paper account: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!sdkReady) {
    warn("the lighter SDK could not be verified — decision cycles will fail until it loads");
  }
  console.log(`\n  kit dir: ${kitLocation().dir}`);
}

// .env.local is a Next convention; the scripts have to load it themselves.
loadDotEnv();

async function main() {
  heading("lobster agent trader setup");

  const nodeOk = checkNode();
  const pythonOk = checkPython();
  if (!nodeOk || !pythonOk) process.exit(1);

  heading("Lighter agent kit");
  const kitDir = installKit();
  let sdkReady = false;
  if (!kitDir) {
    warn("skipping kit checks — install it manually and re-run");
  } else {
    sdkReady = bootstrapSdk(kitDir);
  }

  heading("Local database");
  ensureDatabase();

  if (kitDir) await summarise(sdkReady);

  heading("Next steps");
  console.log("  1. cp .env.example .env.local  and add your LLM API key");
  // 127.0.0.1, not localhost: npm run dev binds loopback and prints the port it
  // actually picked.
  console.log("  2. npm run dev                 → http://127.0.0.1:3210/console");
  console.log("  3. npm run seed                → optional sample data so the console is not empty");
  console.log("\n  Live trading stays off until LIGHTER_ENABLE_LIVE=1 is set explicitly.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
