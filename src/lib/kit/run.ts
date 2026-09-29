import { spawn } from "node:child_process";
import { join } from "node:path";
import { KIT_MISSING_MESSAGE, findKitDir, pythonBin } from "./locate";

export class KitUnavailableError extends Error {
  readonly code = "kit_not_installed";
  constructor() {
    super(KIT_MISSING_MESSAGE);
    this.name = "KitUnavailableError";
  }
}

export class KitCommandError extends Error {
  readonly code = "kit_command_failed";
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "KitCommandError";
  }
}

export type KitScript = "query" | "paper" | "trade" | "health";

export type RunKitOptions = {
  timeoutMs?: number;
  extraEnv?: Record<string, string | undefined>;
};

// First call in a cold session pip-installs lighter-sdk into <kit>/.vendor,
// which the kit documents as 15-40s. Budget generously, and allow override.
const DEFAULT_TIMEOUT_MS = Number(process.env.LIGHTER_TRADER_KIT_TIMEOUT_MS ?? 180_000);

export function parseKitStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

function isErrorEnvelope(value: unknown): value is { error: string; detail?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

export function runKit<T = unknown>(
  script: KitScript,
  args: string[],
  options: RunKitOptions = {},
): Promise<T> {
  const kitDir = findKitDir();
  if (!kitDir) return Promise.reject(new KitUnavailableError());

  const scriptPath = join(kitDir, "scripts", `${script}.py`);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: "1" };
  for (const [key, value] of Object.entries(options.extraEnv ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  return new Promise<T>((resolve, reject) => {
    const child = spawn(pythonBin(), [scriptPath, ...args], {
      cwd: kitDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new KitCommandError(
          `${script}.py timed out after ${timeoutMs}ms`,
          "A cold first call pip-installs lighter-sdk and can take 15-40s; retry, or raise LIGHTER_TRADER_KIT_TIMEOUT_MS.",
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new KitCommandError(`failed to launch ${script}.py: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const parsed = parseKitStdout(stdout);

      if (isErrorEnvelope(parsed)) {
        reject(new KitCommandError(parsed.error, parsed.detail));
        return;
      }
      if (code !== 0) {
        reject(
          new KitCommandError(
            `${script}.py exited with code ${code}`,
            stderr.trim().slice(-600) || undefined,
          ),
        );
        return;
      }
      if (parsed === undefined) {
        reject(
          new KitCommandError(
            `${script}.py produced no JSON on stdout`,
            (stderr.trim() || stdout.trim()).slice(-600) || undefined,
          ),
        );
        return;
      }
      resolve(parsed as T);
    });
  });
}
