import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CREDENTIALS_FIELDS,
  CredentialsError,
  clearCredentials,
  readCredentialsStatus,
  writeCredentials,
} from "@/lib/kit/credentials";

/**
 * These tests must not touch the developer's real credentials file, so HOME is
 * redirected to a throwaway directory for the duration of each case.
 */

// 32 bytes of hex after the 0x prefix, which is what a Lighter key looks like.
const VALID_KEY = `0x${"ab".repeat(64)}`;

function sandbox(run: (home: string) => void) {
  const home = mkdtempSync(join(tmpdir(), "lighter-credentials-"));
  const saved = { home: process.env.HOME, userprofile: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    run(home);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function credentialsFile(home: string) {
  return join(home, ".lighter", "lighter-agent-kit", "credentials");
}

test("a fresh machine reports no credentials instead of throwing", () => {
  sandbox(() => {
    const status = readCredentialsStatus();
    assert.equal(status.present, false);
    assert.equal(status.modeSecure, null);
    assert.deepEqual(
      status.fields.map((f) => f.set),
      CREDENTIALS_FIELDS.map(() => false),
    );
  });
});

test("writing creates the file owner-readable only", () => {
  sandbox((home) => {
    const status = writeCredentials({ privateKey: VALID_KEY, accountIndex: 1, apiKeyIndex: 2 });
    assert.equal(status.present, true);

    const path = credentialsFile(home);
    assert.equal(statSync(path).mode & 0o777, 0o600, "the file must not be group or world readable");
    assert.equal(statSync(join(home, ".lighter", "lighter-agent-kit")).mode & 0o777, 0o700);

    const body = readFileSync(path, "utf8");
    assert.ok(body.includes(`LIGHTER_API_PRIVATE_KEY=${VALID_KEY}`));
    assert.match(body, /LIGHTER_ACCOUNT_INDEX=1/);
  });
});

test("a malformed private key is rejected before it can be written", () => {
  sandbox(() => {
    for (const bad of ["0x123", "not-a-key", `0x${"zz".repeat(64)}`, `0x${"ab".repeat(63)}`]) {
      assert.throws(
        () => writeCredentials({ privateKey: bad }),
        CredentialsError,
        `"${bad}" must not be accepted`,
      );
    }
    assert.equal(readCredentialsStatus().present, false);
  });
});

test("a blank key means keep the stored one, not clear it", () => {
  sandbox((home) => {
    writeCredentials({ privateKey: VALID_KEY });
    // The route layer rejects an explicit blank; at this level it is the
    // "unchanged" signal, and the stored key has to survive it.
    writeCredentials({ privateKey: "   ", accountIndex: 1 });

    const body = readFileSync(credentialsFile(home), "utf8");
    assert.ok(body.includes(`LIGHTER_API_PRIVATE_KEY=${VALID_KEY}`));
  });
});

test("the status never exposes the stored secret", () => {
  sandbox(() => {
    writeCredentials({ privateKey: VALID_KEY });
    const status = readCredentialsStatus();

    const serialized = JSON.stringify(status);
    assert.ok(!serialized.includes(VALID_KEY), "the key must not appear anywhere in the payload");
    assert.ok(
      status.fields.find((f) => f.name === "LIGHTER_API_PRIVATE_KEY")?.set,
      "but the field is still reported as set",
    );
  });
});

test("saving an index without a key leaves the stored key untouched", () => {
  sandbox((home) => {
    writeCredentials({ privateKey: VALID_KEY, accountIndex: 0 });
    writeCredentials({ accountIndex: 3 });

    const body = readFileSync(credentialsFile(home), "utf8");
    assert.ok(
      body.includes(`LIGHTER_API_PRIVATE_KEY=${VALID_KEY}`),
      "the key survives an index-only save",
    );
    assert.match(body, /LIGHTER_ACCOUNT_INDEX=3/);
  });
});

test("a hand-written variable this project does not manage is preserved", () => {
  sandbox((home) => {
    const path = credentialsFile(home);
    const dir = join(home, ".lighter", "lighter-agent-kit");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path,
      ["# my notes", "LIGHTER_HOST=api.lighter.xyz", "LIGHTER_API_PRIVATE_KEY=0xold", ""].join("\n"),
    );
    chmodSync(path, 0o600);

    writeCredentials({ privateKey: VALID_KEY });

    const body = readFileSync(path, "utf8");
    assert.match(body, /LIGHTER_HOST=api\.lighter\.xyz/, "an unrelated variable must survive");
    assert.ok(!body.includes("0xold"), "the stale key is replaced");
    assert.match(body, new RegExp(VALID_KEY));
  });
});

test("clearing removes the managed keys and leaves the rest of the file", () => {
  sandbox((home) => {
    const path = credentialsFile(home);
    mkdirSync(join(home, ".lighter", "lighter-agent-kit"), { recursive: true });
    writeFileSync(path, ["LIGHTER_HOST=api.lighter.xyz", "LIGHTER_API_PRIVATE_KEY=0xdeadbeef", ""].join("\n"));

    const result = clearCredentials();
    assert.equal(result.removed, true);

    const body = readFileSync(path, "utf8");
    assert.match(body, /LIGHTER_HOST=api\.lighter\.xyz/);
    assert.ok(!body.includes("0xdeadbeef"));
  });
});

// Regression: LIGHTER_ETH_PRIVATE_KEY used to be in the "managed" set, so a
// single Clear click silently deleted an L1 wallet key the form never showed —
// and the only copy of it.
test("clearing never touches an LIGHTER_ETH_PRIVATE_KEY the user wrote by hand", () => {
  sandbox((home) => {
    const path = credentialsFile(home);
    const dir = join(home, ".lighter", "lighter-agent-kit");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path,
      ["LIGHTER_ETH_PRIVATE_KEY=0xMY_L1_WALLET", "LIGHTER_API_PRIVATE_KEY=0xAPIKEY", ""].join("\n"),
    );

    clearCredentials();

    const body = readFileSync(path, "utf8");
    assert.match(body, /LIGHTER_ETH_PRIVATE_KEY=0xMY_L1_WALLET/, "the L1 wallet key must survive");
    assert.ok(!body.includes("0xAPIKEY"), "the managed key is still removed");
  });
});

test("saving never disturbs an LIGHTER_ETH_PRIVATE_KEY either", () => {
  sandbox((home) => {
    const path = credentialsFile(home);
    const dir = join(home, ".lighter", "lighter-agent-kit");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, ["LIGHTER_ETH_PRIVATE_KEY=0xMY_L1_WALLET", ""].join("\n"));

    writeCredentials({ privateKey: VALID_KEY, accountIndex: 4 });

    const body = readFileSync(path, "utf8");
    assert.match(body, /LIGHTER_ETH_PRIVATE_KEY=0xMY_L1_WALLET/);
    assert.match(body, /LIGHTER_ACCOUNT_INDEX=4/);
  });
});

// Regression: a crash between truncate and write left a zero-byte credentials
// file, i.e. an unrecoverable private key.
test("a write leaves no temp file behind", () => {
  sandbox((home) => {
    writeCredentials({ privateKey: VALID_KEY });
    const dir = join(home, ".lighter", "lighter-agent-kit");
    const leftovers = readdirSync(dir).filter((name) => name.includes(".tmp"));
    assert.deepEqual(leftovers, [], "the temp file used for the atomic rename must be gone");
  });
});

test("clearing a file that holds nothing but managed keys deletes it", () => {
  sandbox(() => {
    writeCredentials({ privateKey: VALID_KEY, accountIndex: 1, apiKeyIndex: 2 });
    const result = clearCredentials();

    assert.equal(result.removed, true);
    assert.equal(readCredentialsStatus().present, false);
  });
});

test("clearing on a machine with no credentials file is a no-op", () => {
  sandbox(() => {
    const result = clearCredentials();
    assert.equal(result.removed, false);
    assert.equal(readCredentialsStatus().present, false);
  });
});

// Regression: the parser used to strip quotes with a loose regex, so a value
// like KEY="abc lost its trailing quote in our view while the kit kept it —
// the UI would report a field as set that the kit could not actually use.
test("quoted values round-trip the way the kit reads them", () => {
  sandbox((home) => {
    const path = credentialsFile(home);
    const dir = join(home, ".lighter", "lighter-agent-kit");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path,
      [
        `LIGHTER_API_PRIVATE_KEY="${VALID_KEY}"`,
        "LIGHTER_HOST='api.lighter.xyz'",
        'LIGHTER_ACCOUNT_INDEX="0',
        "",
      ].join("\n"),
    );

    writeCredentials({ apiKeyIndex: 7 });

    const body = readFileSync(path, "utf8");
    // A matched pair is unwrapped on read, then written back bare.
    assert.match(body, new RegExp(`LIGHTER_API_PRIVATE_KEY=${VALID_KEY}\\n`));
    assert.match(body, /LIGHTER_HOST=api\.lighter\.xyz/);
    // An unmatched quote is not a pair, so the value keeps its quote — which is
    // what the kit sees too.
    assert.match(body, /LIGHTER_ACCOUNT_INDEX="0/);
    assert.match(body, /LIGHTER_API_KEY_INDEX=7/);
  });
});

test("an insecure file mode is reported so the UI can warn", () => {
  sandbox((home) => {
    const path = credentialsFile(home);
    mkdirSync(join(home, ".lighter", "lighter-agent-kit"), { recursive: true });
    writeFileSync(path, `LIGHTER_API_PRIVATE_KEY=${VALID_KEY}\n`);
    chmodSync(path, 0o644);

    const status = readCredentialsStatus();
    assert.equal(status.present, true);
    assert.equal(status.modeSecure, false);
  });
});
