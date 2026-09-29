import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

/**
 * `npm run seed` exists so the console is not empty on a first run. If the
 * sample equity curve swings more than the default daily-loss limit, the first
 * "Run once" on a fresh install risked being refused for a loss the user never
 * took.
 *
 * The assertion is deliberately on the *range* of the whole series rather than
 * on a "today" window: the daily-loss check compares the newest row against the
 * newest row before local midnight, so a window-based test would change outcome
 * with the wall-clock hour it happened to run at. Any 24h window's drop is
 * bounded by the total range, so bounding the range is both deterministic and
 * strictly stronger.
 *
 * The seed script is a program rather than a module, so this runs it against a
 * throwaway database and inspects the result.
 */
test("the seeded equity curve cannot trip the default daily-loss guardrail", () => {
  const scratch = mkdtempSync(join(tmpdir(), "lt-seed-"));
  const dbPath = join(scratch, "seed.db");

  execFileSync(join(process.cwd(), "node_modules", ".bin", "tsx"), ["scripts/seed.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, LIGHTER_TRADER_DB: dbPath },
    stdio: "pipe",
  });

  const db = new DatabaseSync(dbPath);
  try {
    const rows = db
      .prepare("SELECT total_pnl FROM equity WHERE mode = 'paper'")
      .all() as Array<{ total_pnl: number }>;

    assert.ok(rows.length > 1, "the seed should write an equity series");

    const values = rows.map((row) => row.total_pnl);
    const range = Math.max(...values) - Math.min(...values);

    // The default dailyLossLimitUsd is 20 and the guardrail fires at <= -limit.
    assert.ok(
      range < 20,
      `seeded P&L spans ${range.toFixed(2)}, which can trip the default -$20 daily loss limit on a fresh install`,
    );
  } finally {
    db.close();
  }
});
