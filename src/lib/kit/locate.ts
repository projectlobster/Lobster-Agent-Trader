import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const KIT_MISSING_MESSAGE =
  "lighter-agent-kit not found. Run `npm run setup` to install it, clone it to ~/.agents/skills/lighter-agent-kit, or set LIGHTER_AGENT_KIT_DIR.";

export function pythonBin(): string {
  return process.env.LIGHTER_TRADER_PYTHON?.trim() || "python3";
}

export function kitSearchPaths(): string[] {
  const raw = [
    process.env.LIGHTER_AGENT_KIT_DIR,
    join(process.cwd(), ".agents", "skills", "lighter-agent-kit"),
    join(homedir(), ".agents", "skills", "lighter-agent-kit"),
    join(homedir(), ".claude", "skills", "lighter-agent-kit"),
  ];
  return raw
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => resolve(value.trim()));
}

let cached: string | null | undefined;

export function findKitDir(): string | null {
  if (cached !== undefined) return cached;
  for (const dir of kitSearchPaths()) {
    if (existsSync(join(dir, "scripts", "query.py"))) {
      cached = dir;
      return dir;
    }
  }
  cached = null;
  return null;
}

export function clearKitCache(): void {
  cached = undefined;
}

export function kitLocation() {
  const dir = findKitDir();
  return {
    installed: dir !== null,
    dir,
    python: pythonBin(),
    searched: kitSearchPaths(),
    // The kit vendors lighter-sdk into <kit>/.vendor/pyX.Y on first use. It may
    // also already be importable from a system-wide install, in which case no
    // vendoring happens at all.
    sdkVendored: dir ? existsSync(join(dir, ".vendor")) : false,
  };
}
