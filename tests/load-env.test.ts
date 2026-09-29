import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadDotEnv } from "@/lib/load-env";

function inTempDir(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "lt-env-"));
  const previous = process.cwd();
  try {
    process.chdir(dir);
    run(dir);
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
}

test("loads keys from .env.local", () => {
  inTempDir(() => {
    writeFileSync(".env.local", "LT_TEST_A=one\nLT_TEST_B=two\n");
    delete process.env.LT_TEST_A;
    delete process.env.LT_TEST_B;

    const loaded = loadDotEnv();

    assert.equal(process.env.LT_TEST_A, "one");
    assert.equal(process.env.LT_TEST_B, "two");
    assert.deepEqual(loaded.sort(), ["LT_TEST_A", "LT_TEST_B"]);

    delete process.env.LT_TEST_A;
    delete process.env.LT_TEST_B;
  });
});

test("a real environment variable is never overwritten", () => {
  inTempDir(() => {
    writeFileSync(".env.local", "LT_TEST_C=from_file\n");
    process.env.LT_TEST_C = "from_env";

    const loaded = loadDotEnv();

    assert.equal(process.env.LT_TEST_C, "from_env");
    assert.ok(!loaded.includes("LT_TEST_C"));
    delete process.env.LT_TEST_C;
  });
});

test("comments, blank lines, export prefixes and quotes are handled", () => {
  inTempDir(() => {
    writeFileSync(
      ".env.local",
      [
        "# a comment",
        "",
        "   ",
        "LT_TEST_D=plain",
        'export LT_TEST_E="quoted value"',
        "LT_TEST_F='single'",
        "not a valid line",
        "=novalue",
      ].join("\n"),
    );
    for (const key of ["LT_TEST_D", "LT_TEST_E", "LT_TEST_F"]) delete process.env[key];

    loadDotEnv();

    assert.equal(process.env.LT_TEST_D, "plain");
    assert.equal(process.env.LT_TEST_E, "quoted value");
    assert.equal(process.env.LT_TEST_F, "single");
    for (const key of ["LT_TEST_D", "LT_TEST_E", "LT_TEST_F"]) delete process.env[key];
  });
});

test("a missing file is not an error", () => {
  inTempDir(() => {
    assert.deepEqual(loadDotEnv([".env.nope"]), []);
  });
});

test("a later file does not clobber an earlier one", () => {
  inTempDir(() => {
    writeFileSync(".env.local", "LT_TEST_G=local\n");
    writeFileSync(".env", "LT_TEST_G=base\n");
    delete process.env.LT_TEST_G;

    loadDotEnv([".env.local", ".env"]);

    assert.equal(process.env.LT_TEST_G, "local");
    delete process.env.LT_TEST_G;
  });
});
