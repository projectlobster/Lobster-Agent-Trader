import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS periods (
  period_key TEXT PRIMARY KEY,
  budget_tokens INTEGER NOT NULL,
  reserved_tokens INTEGER NOT NULL,
  carry_in_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  period_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  symbol TEXT,
  action TEXT,
  decision_json TEXT,
  snapshot_json TEXT,
  trace_json TEXT,
  order_json TEXT,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  pnl_after REAL,
  error TEXT,
  stop_reason TEXT
);
CREATE INDEX IF NOT EXISTS runs_started_idx ON runs (started_at DESC);
CREATE INDEX IF NOT EXISTS runs_period_idx ON runs (period_key);

CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS llm_calls_run_idx ON llm_calls (run_id);
CREATE INDEX IF NOT EXISTS llm_calls_created_idx ON llm_calls (created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  engine TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  amount REAL NOT NULL,
  price REAL,
  notional_usd REAL,
  client_order_index TEXT,
  filled_size REAL,
  avg_price REAL,
  fee REAL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_run_idx ON orders (run_id);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS equity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at TEXT NOT NULL,
  mode TEXT NOT NULL,
  equity REAL NOT NULL,
  collateral REAL NOT NULL,
  unrealized_pnl REAL NOT NULL,
  total_pnl REAL NOT NULL,
  initial_collateral REAL
);
CREATE INDEX IF NOT EXISTS equity_taken_idx ON equity (taken_at DESC);

CREATE TABLE IF NOT EXISTS engine_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  running INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'paper',
  interval_seconds INTEGER NOT NULL DEFAULT 300,
  started_at TEXT,
  last_tick_at TEXT,
  last_error TEXT,
  stop_reason TEXT
);
INSERT OR IGNORE INTO engine_state (id) VALUES (1);
`;

/** Idempotent column add, so an existing database picks up new fields. */
function ensureColumn(db: DatabaseSync, table: string, column: string, ddl: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function migrate(db: DatabaseSync): void {
  // Added after the first release: a cross-process lease so the web server and
  // the headless `npm run engine` worker cannot both run a decision cycle.
  ensureColumn(db, "engine_state", "lease_owner", "lease_owner TEXT");
  ensureColumn(db, "engine_state", "lease_expires_at", "lease_expires_at TEXT");
}

export function dbPath(): string {
  return resolve(process.env.LIGHTER_TRADER_DB ?? "./data/lighter-trader.db");
}

type GlobalWithDb = typeof globalThis & { __lighterTraderDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (g.__lighterTraderDb) return g.__lighterTraderDb;

  const path = dbPath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  // The settings table can hold a model API key, so keep the directory and the
  // database owner-only rather than the default 0755/0644.
  if (process.platform !== "win32") {
    try {
      chmodSync(dir, 0o700);
    } catch {
      // Best effort — a shared directory may not be ours to chmod.
    }
  }

  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  if (process.platform !== "win32") {
    // WAL and SHM siblings also hold table pages, and SQLite does not always
    // copy the database's mode onto them. They only exist once WAL is on, so
    // this runs after the pragma.
    for (const sibling of [path, `${path}-wal`, `${path}-shm`]) {
      try {
        chmodSync(sibling, 0o600);
      } catch {
        // Not every sibling exists yet; ignore.
      }
    }
  }

  db.exec(SCHEMA);
  migrate(db);
  g.__lighterTraderDb = db;
  return db;
}

// node:sqlite returns rows with a null prototype, which React refuses to pass
// across the server/client boundary. Copy every row into a plain object.
export function getAll<T>(sql: string, ...params: unknown[]): T[] {
  const rows = getDb()
    .prepare(sql)
    .all(...(params as never[])) as T[];
  return rows.map((row) => ({ ...row }));
}

export function getOne<T>(sql: string, ...params: unknown[]): T | undefined {
  const row = getDb()
    .prepare(sql)
    .get(...(params as never[])) as T | undefined;
  return row === undefined ? undefined : { ...row };
}

export function run(sql: string, ...params: unknown[]): { changes: number } {
  const result = getDb()
    .prepare(sql)
    .run(...(params as never[]));
  return { changes: Number(result.changes ?? 0) };
}
