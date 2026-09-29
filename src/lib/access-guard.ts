import { timingSafeEqual } from "node:crypto";

/**
 * The decision logic behind src/proxy.ts, kept separate so it can be tested
 * without booting a server. src/proxy.ts stays a thin adapter over these.
 */

const PASSWORD_ENV = "LIGHTER_TRADER_PASSWORD";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type GuardInput = {
  method: string;
  /** Lower-cased header lookup. */
  header: (name: string) => string | null;
  /** Origin Next derived from the request, used only when Host is absent. */
  urlOrigin: string;
};

/**
 * Reject a state-changing request that the browser attributes to another site.
 * Sec-Fetch-Site is sent by every current browser and cannot be forged by a
 * page; Origin is the fallback for older ones. A missing header on a write
 * means a non-browser client, which basic auth is what protects.
 */
export function isCrossSite({ method, header, urlOrigin }: GuardInput): boolean {
  if (SAFE_METHODS.has(method)) return false;

  const fetchSite = header("sec-fetch-site");
  if (fetchSite) return fetchSite === "cross-site";

  const origin = header("origin");
  if (!origin || origin === "null") return false;

  // Compare against the Host the request actually arrived on. Next's
  // nextUrl.origin normalises to localhost, so a browser reaching the box by
  // its LAN address would otherwise be treated as cross-site and have every
  // write rejected.
  const host = header("host");
  if (host) return origin !== `http://${host}` && origin !== `https://${host}`;

  return origin !== urlOrigin;
}

export function isAuthorized(authorization: string | null, password: string): boolean {
  if (!authorization?.toLowerCase().startsWith("basic ")) return false;

  const encoded = authorization.slice(6).trim();
  // Buffer, not atob: atob decodes as Latin-1, so any non-ASCII password (ü,
  // and every CJK character) would arrive as mojibake and could never match,
  // silently locking the user out of their own server.
  const decoded = Buffer.from(encoded, "base64");
  // Buffer.from silently drops trailing junk instead of throwing, so a
  // malformed header would otherwise decode to a short buffer and merely fail
  // the length check rather than being rejected as malformed.
  if (
    decoded.length === 0 ||
    decoded.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")
  ) {
    return false;
  }

  const separator = decoded.indexOf(0x3a); // ":"
  if (separator === -1) return false;

  const passwordBytes = decoded.subarray(separator + 1);
  const expectedBytes = Buffer.from(password, "utf8");
  // The length check short-circuits before the constant-time compare, so it
  // leaks the password's length. That is acceptable under the threat model
  // this guard is built for, and a fixed-size hash compare would only be
  // marginally stronger.
  if (passwordBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(passwordBytes, expectedBytes);
}

/** Undefined means "no password configured", i.e. do not authenticate. */
export function accessPassword(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[PASSWORD_ENV]?.trim();
  return value ? value : undefined;
}
