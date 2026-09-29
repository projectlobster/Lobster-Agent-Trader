import assert from "node:assert/strict";
import { test } from "node:test";
import { accessPassword, isAuthorized, isCrossSite } from "@/lib/access-guard";

function request(
  method: string,
  headers: Record<string, string> = {},
  urlOrigin = "http://localhost:3210",
) {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    header: (name: string) => lower.get(name.toLowerCase()) ?? null,
    urlOrigin,
  };
}

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;

// Regression: the guard decoded with atob, which is Latin-1, so a password
// containing ü — or any CJK character — could never match. The user set a
// password, restarted, and was locked out of their own server with no clue.
test("a non-ASCII password is accepted", () => {
  for (const password of ["p@ss w0rd!ünicode", "我的交易密码", "café", "🔑pass"]) {
    assert.ok(
      isAuthorized(basic("admin", password), password),
      `"${password}" must be able to log in`,
    );
  }
});

test("the username is not part of the check", () => {
  assert.ok(isAuthorized(basic("anyone", "hunter2"), "hunter2"));
});

test("a wrong password is rejected regardless of shape", () => {
  assert.equal(isAuthorized(basic("admin", "hunter3"), "hunter2"), false);
  assert.equal(isAuthorized(basic("admin", "hunter2 "), "hunter2"), false);
  assert.equal(isAuthorized(basic("admin", "Hunter2"), "hunter2"), false);
  assert.equal(isAuthorized(basic("admin", ""), "hunter2"), false);
});

test("a malformed Authorization header is rejected", () => {
  for (const header of [
    null,
    "",
    "Basic",
    "Basic ",
    "Bearer token",
    "basic", // scheme only, no credentials
    `Basic ${Buffer.from("nocolon").toString("base64")}`,
    "Basic !!!!not-base64!!!!",
  ]) {
    assert.equal(isAuthorized(header, "hunter2"), false, `${header} must not authenticate`);
  }
});

// Buffer.from drops invalid trailing characters instead of throwing, so a
// padded-but-wrong header has to be caught by re-encoding, not just by the
// length check.
test("a header with junk appended to the base64 is rejected", () => {
  const valid = basic("admin", "hunter2").slice(6);
  assert.equal(isAuthorized(`Basic ${valid}ZZZZ`, "hunter2"), false);
  assert.equal(isAuthorized(`Basic ${valid}!!!!`, "hunter2"), false);
});

test("the scheme is matched case-insensitively", () => {
  const credentials = Buffer.from("admin:hunter2", "utf8").toString("base64");
  assert.ok(isAuthorized(`basic ${credentials}`, "hunter2"));
  assert.ok(isAuthorized(`BASIC ${credentials}`, "hunter2"));
});

// Regression: the fallback compared Origin against nextUrl.origin, which Next
// normalises to localhost. A browser reaching the box by IP or LAN name sent a
// matching Origin and had every write rejected with 403.
test("same-origin writes pass on any host, not just localhost", () => {
  for (const host of ["127.0.0.1:3210", "localhost:3210", "trading.box.local:3210", "[::1]:3210"]) {
    assert.equal(
      isCrossSite(request("POST", { "sec-fetch-site": "same-origin", host })),
      false,
      `${host} must be treated as same-origin`,
    );
    assert.equal(
      isCrossSite(request("POST", { host, origin: `http://${host}` })),
      false,
      `Origin http://${host} must match its own Host`,
    );
  }
});

test("an https Origin matches a plain Host header too", () => {
  // A TLS-terminating proxy in front still forwards the original Host.
  assert.equal(
    isCrossSite(request("POST", { host: "trade.example.com", origin: "https://trade.example.com" })),
    false,
  );
});

test("a genuinely cross-site write is blocked", () => {
  assert.equal(isCrossSite(request("POST", { "sec-fetch-site": "cross-site" })), true);
  assert.equal(
    isCrossSite(request("POST", { host: "localhost:3210", origin: "https://evil.example" })),
    true,
  );
  assert.equal(
    isCrossSite(request("DELETE", { host: "localhost:3210", origin: "https://evil.example" })),
    true,
  );
});

test("safe methods are never treated as cross-site", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(isCrossSite(request(method, { "sec-fetch-site": "cross-site" })), false);
  }
});

test("a write from a non-browser client is left to basic auth", () => {
  // curl sends no Origin and no Sec-Fetch-Site; only auth should stop it.
  assert.equal(isCrossSite(request("POST", {})), false);
  assert.equal(isCrossSite(request("POST", { origin: "null" })), false);
});

test("Sec-Fetch-Site wins over a matching Origin", () => {
  assert.equal(
    isCrossSite(
      request("POST", {
        "sec-fetch-site": "cross-site",
        host: "localhost:3210",
        origin: "http://localhost:3210",
      }),
    ),
    true,
  );
});

test("an unset or blank password disables authentication", () => {
  const env = (value?: string) => ({ LIGHTER_TRADER_PASSWORD: value }) as unknown as NodeJS.ProcessEnv;
  assert.equal(accessPassword(env(undefined)), undefined);
  assert.equal(accessPassword(env("")), undefined);
  assert.equal(accessPassword(env("   ")), undefined);
  assert.equal(accessPassword(env("x")), "x");
});
