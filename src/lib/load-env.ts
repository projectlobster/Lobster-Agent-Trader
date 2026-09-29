import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Next.js loads `.env.local` for the web server, but the tsx scripts under
 * `scripts/` run as plain Node processes and would otherwise see none of it —
 * which silently broke `npm run engine` (the recommended unattended path) and
 * `npm run setup`.
 *
 * Real environment variables always win, matching the precedence documented for
 * the settings layer. Returns the key NAMES it loaded so callers can report what
 * happened without ever touching the values.
 */
export function loadDotEnv(files: string[] = [".env.local", ".env"]): string[] {
  const loaded: string[] = [];

  for (const file of files) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;

    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim().replace(/^export\s+/, "");
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue;

      let value = line.slice(separator + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1);
      if (quoted) value = value.slice(1, -1);

      process.env[key] = value;
      loaded.push(key);
    }
  }

  return loaded;
}
