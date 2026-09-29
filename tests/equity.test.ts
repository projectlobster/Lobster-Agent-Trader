import assert from "node:assert/strict";
import { test } from "node:test";
import { listEquity } from "@/lib/store/equity";
import { run } from "@/lib/store/db";

function seed(rows: Array<{ at: string; equity: number }>) {
  run("DELETE FROM equity");
  for (const row of rows) {
    run(
      `INSERT INTO equity (taken_at, mode, equity, collateral, unrealized_pnl, total_pnl, initial_collateral)
       VALUES (?, 'paper', ?, 10000, 0, ?, 10000)`,
      row.at,
      row.equity,
      row.equity - 10000,
    );
  }
}

function iso(offsetHours: number): string {
  return new Date(Date.now() - offsetHours * 3_600_000).toISOString();
}

// Regression: `ORDER BY taken_at ASC LIMIT n` returns the *oldest* n rows, so the
// dashboard equity curve silently froze on stale data once the table grew past
// the query limit — it never showed the newest point again.
test("listEquity returns the newest rows, not the oldest", () => {
  seed(
    Array.from({ length: 30 }, (_, i) => ({
      at: iso(30 - i),
      equity: 10000 + i,
    })),
  );

  const rows = listEquity(10, "paper");

  assert.equal(rows.length, 10);
  const newest = rows[rows.length - 1];
  assert.ok(newest, "expected a newest row");
  // The newest seeded row is equity 10029 at ~1h ago.
  assert.equal(newest.equity, 10029);
  assert.ok(
    Date.now() - new Date(newest.taken_at).getTime() < 2 * 3_600_000,
    "newest returned row should be recent, not a day old",
  );
});

test("rows come back oldest-first so the chart reads left to right", () => {
  seed(
    Array.from({ length: 12 }, (_, i) => ({ at: iso(12 - i), equity: 10000 + i })),
  );

  const rows = listEquity(5, "paper");
  const timestamps = rows.map((r) => new Date(r.taken_at).getTime());

  for (let i = 1; i < timestamps.length; i += 1) {
    assert.ok(timestamps[i] >= timestamps[i - 1], "rows must be ascending");
  }
  assert.deepEqual(rows.map((r) => r.equity), [10007, 10008, 10009, 10010, 10011]);
});

test("the limit is capped and floored", () => {
  seed(Array.from({ length: 5 }, (_, i) => ({ at: iso(5 - i), equity: 10000 + i })));
  assert.equal(listEquity(0, "paper").length, 1);
  assert.equal(listEquity(99999, "paper").length, 5);
});

test("rows from another mode are excluded", () => {
  run("DELETE FROM equity");
  run(
    `INSERT INTO equity (taken_at, mode, equity, collateral, unrealized_pnl, total_pnl, initial_collateral)
     VALUES (?, 'paper', 1, 1, 0, 0, 1)`,
    iso(1),
  );
  run(
    `INSERT INTO equity (taken_at, mode, equity, collateral, unrealized_pnl, total_pnl, initial_collateral)
     VALUES (?, 'live', 2, 2, 0, 0, 1)`,
    iso(0),
  );

  const paper = listEquity(10, "paper");
  assert.equal(paper.length, 1);
  assert.equal(paper[0].mode, "paper");
});
