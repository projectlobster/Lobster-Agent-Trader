import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { authStatus } from "@/lib/kit/query";
import type { AuthStatus } from "@/lib/kit/types";

/**
 * The private key never enters the database. It is written to the file the kit
 * itself reads, owner-only, and the browser only ever learns whether one is
 * present — never its value.
 */

const PRIVATE_KEY = "LIGHTER_API_PRIVATE_KEY";
const ACCOUNT_INDEX = "LIGHTER_ACCOUNT_INDEX";
const API_KEY_INDEX = "LIGHTER_API_KEY_INDEX";

/** Reported in the UI so the user can see what the file is expected to hold. */
export const CREDENTIALS_FIELDS = [
  PRIVATE_KEY,
  "LIGHTER_ETH_PRIVATE_KEY",
  ACCOUNT_INDEX,
  API_KEY_INDEX,
] as const;

/**
 * Only the fields this project actually writes. LIGHTER_ETH_PRIVATE_KEY is a
 * separate L1 wallet the kit can use for change_api_key and transfers; this
 * form does not manage it, so saving and clearing must both leave it alone —
 * deleting it would destroy a key the UI never showed.
 */
const MANAGED_FIELDS: ReadonlySet<string> = new Set([PRIVATE_KEY, ACCOUNT_INDEX, API_KEY_INDEX]);

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{128}$/;

/** Same policy as the kit's _paths.py, so both agree on where the file lives. */
export function credentialsPath(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const base = appData ? appData : join(homedir(), "AppData", "Roaming");
    return join(base, "lighter-agent-kit", "credentials");
  }
  return join(homedir(), ".lighter", "lighter-agent-kit", "credentials");
}

type ParsedLine = { key: string; value: string };

/**
 * Mirrors the kit's own reader: strip an optional `export `, take the first
 * `=`, and drop a *matched* pair of surrounding quotes. An unmatched quote is
 * left alone so we never disagree with what the kit will actually sign with.
 */
function parseLine(rawLine: string): ParsedLine | null {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) return null;

  const body = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
  const eq = body.indexOf("=");
  if (eq === -1) return null;

  const key = body.slice(0, eq).trim();
  if (!key) return null;

  let value = body.slice(eq + 1).trim();
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value[value.length - 1] === first) {
      value = value.slice(1, -1);
    }
  }

  return value ? { key, value } : null;
}

function parseFile(raw: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const parsed = parseLine(rawLine);
    // A later duplicate wins, so the reported state matches what a rewrite
    // would keep.
    if (parsed) entries.set(parsed.key, parsed.value);
  }
  return entries;
}

const COMMENTS = [
  "# Lighter credentials — managed by Lobster Agent Trader.",
  "# Kept outside the repository and owner-readable only. Never commit this file.",
];

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function serialize(entries: Map<string, string>): string {
  const body = [...entries].map(([key, value]) => `${key}=${value}`);
  return `${[...COMMENTS, ...body, ""].join("\n")}`;
}

/**
 * Write via a temp file and rename, so a crash mid-write cannot leave the user
 * with a truncated — and unrecoverable — key.
 */
function writeAtomically(path: string, contents: string) {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, contents, { mode: 0o600 });
  try {
    renameSync(temp, path);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // The rename already failed; a stray temp file is the lesser problem.
    }
    throw error;
  }
  // rename carries the temp file's mode over, but be explicit: the credentials
  // file must not be group or world readable regardless of umask.
  chmodSync(path, 0o600);
}

export type CredentialsFieldStatus = { name: string; set: boolean };

export type CredentialsStatus = {
  path: string;
  present: boolean;
  modeSecure: boolean | null;
  fields: CredentialsFieldStatus[];
};

export function readCredentialsStatus(): CredentialsStatus {
  const path = credentialsPath();
  let present = false;
  let modeSecure: boolean | null = null;
  let fields: CredentialsFieldStatus[] = CREDENTIALS_FIELDS.map((name) => ({ name, set: false }));

  try {
    const entries = parseFile(readFileSync(path, "utf8"));
    present = true;
    if (process.platform !== "win32") {
      modeSecure = (statSync(path).mode & 0o777) === 0o600;
    }
    fields = CREDENTIALS_FIELDS.map((name) => ({ name, set: entries.has(name) }));
  } catch {
    // Absent or unreadable: report the defaults rather than throwing, so the
    // Settings page can render an input instead of a 500.
  }

  return { path, present, modeSecure, fields };
}

export class CredentialsError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "CredentialsError";
  }
}

export type SaveCredentialsInput = {
  privateKey?: string;
  accountIndex?: number;
  apiKeyIndex?: number;
};

/** Never logs or returns a secret. */
export function writeCredentials(input: SaveCredentialsInput): CredentialsStatus {
  const path = credentialsPath();
  const privateKey = input.privateKey?.trim();

  if (privateKey && !PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new CredentialsError(
      "the private key must be a 0x-prefixed 32-byte hex string (66 characters)",
      "invalid_private_key",
    );
  }

  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Best effort: a shared home directory can refuse this, and the file mode
    // below is the control that actually matters.
  }

  // Everything already in the file is carried over, managed fields included:
  // the browser never receives the key back, so a save that only touches an
  // index must not be able to drop the stored one.
  const entries = parseFile(readFileSafe(path));

  if (privateKey) entries.set(PRIVATE_KEY, privateKey);
  if (input.accountIndex !== undefined) entries.set(ACCOUNT_INDEX, String(input.accountIndex));
  if (input.apiKeyIndex !== undefined) entries.set(API_KEY_INDEX, String(input.apiKeyIndex));

  writeAtomically(path, serialize(entries));

  return readCredentialsStatus();
}

export type ClearCredentialsResult = {
  removed: boolean;
  path: string;
};

/**
 * Drops the fields this form manages. Anything else in the file — including an
 * LIGHTER_ETH_PRIVATE_KEY the user wrote by hand — is left exactly as it was.
 */
export function clearCredentials(): ClearCredentialsResult {
  const path = credentialsPath();
  let removed = false;

  const entries = parseFile(readFileSafe(path));
  for (const key of [...entries.keys()]) {
    if (MANAGED_FIELDS.has(key)) entries.delete(key);
  }

  try {
    if (entries.size === 0) {
      unlinkSync(path);
    } else {
      writeAtomically(path, serialize(entries));
    }
    removed = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }

  return { removed, path };
}

export async function credentialsAuthStatus(): Promise<AuthStatus | null> {
  try {
    return await authStatus();
  } catch {
    return null;
  }
}
