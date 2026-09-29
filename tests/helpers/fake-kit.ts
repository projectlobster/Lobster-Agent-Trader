import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A stand-in for lighter-agent-kit: a throwaway directory whose `scripts/*.py`
 * replay canned JSON from a table, so the whole decision loop can be exercised
 * without the real kit, without network, and without touching the user's
 * accounts. Responses are keyed by "<script> <first two positional args>", e.g.
 * "paper order market" or "query market info".
 */
const STUB_SOURCE = `#!/usr/bin/env python3
import json, os, sys, time

name = os.path.basename(sys.argv[0]).replace(".py", "")
positional = [a for a in sys.argv[1:] if not a.startswith("--")]
key = name + (" " + " ".join(positional[:2]) if positional else "")

delay = float(os.environ.get("LIGHTER_FAKE_DELAY", "0"))
if delay:
    time.sleep(delay)

try:
    with open(os.environ["LIGHTER_FAKE_KIT"], "r") as handle:
        table = json.load(handle)
except Exception as exc:
    print(json.dumps({"error": "cannot read stub table: %s" % exc}))
    sys.exit(1)

entry = table.get(key)
if entry is None:
    print(json.dumps({"error": "no stub for %s" % key}))
    sys.exit(1)

print(json.dumps(entry, indent=2))
sys.exit(1 if "error" in entry else 0)
`;

export type StubTable = Record<string, unknown>;

export type FakeKit = {
  dir: string;
  setStub: (key: string, value: unknown) => void;
  setDelay: (seconds: number) => void;
  restore: () => void;
};

let tablePath = "";

export function writeTable(table: StubTable) {
  writeFileSync(tablePath, JSON.stringify(table, null, 2));
}

export function installFakeKit(table: StubTable): FakeKit {
  const root = mkdtempSync(join(tmpdir(), "lt-fakekit-"));
  const scripts = join(root, "scripts");
  mkdirSync(scripts, { recursive: true });

  for (const name of ["query", "paper", "trade", "health"]) {
    writeFileSync(join(scripts, `${name}.py`), STUB_SOURCE, { mode: 0o755 });
  }

  tablePath = join(root, "responses.json");
  writeTable(table);

  const previous = {
    kitDir: process.env.LIGHTER_AGENT_KIT_DIR,
    table: process.env.LIGHTER_FAKE_KIT,
    delay: process.env.LIGHTER_FAKE_DELAY,
  };
  process.env.LIGHTER_AGENT_KIT_DIR = root;
  process.env.LIGHTER_FAKE_KIT = tablePath;
  process.env.LIGHTER_FAKE_DELAY = "0";

  return {
    dir: root,
    setStub(key, value) {
      const current = JSON.parse(readFileSync(tablePath, "utf8")) as StubTable;
      current[key] = value;
      writeTable(current);
    },
    setDelay(seconds) {
      process.env.LIGHTER_FAKE_DELAY = String(seconds);
    },
    restore() {
      for (const [key, value] of [
        ["LIGHTER_AGENT_KIT_DIR", previous.kitDir],
        ["LIGHTER_FAKE_KIT", previous.table],
        ["LIGHTER_FAKE_DELAY", previous.delay],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

export function defaultStubs(overrides: StubTable = {}): StubTable {
  const mark = 84_000;
  const base: StubTable = {
    health: { status: "ok", version: "0.1.0" },
    "query market info": {
      code: 200,
      order_books: [
        {
          symbol: "BTC",
          market_id: 1,
          market_type: "perp",
          status: "active",
          taker_fee: "0.0000",
          maker_fee: "0.0000",
          min_base_amount: "0.00007",
          min_quote_amount: "10.000000",
          supported_size_decimals: 5,
          supported_price_decimals: 1,
          supported_quote_decimals: 6,
          open_interest: "392.4",
        },
      ],
    },
    "query market stats": {
      code: 200,
      order_book_stats: [
        {
          symbol: "BTC",
          last_trade_price: mark,
          daily_trades_count: 1000,
          daily_quote_token_volume: 550_000_000,
          daily_price_change: -0.83,
        },
      ],
    },
    "query market funding": {
      code: 200,
      funding_rates: [
        { market_id: 1, exchange: "binance", symbol: "BTC", rate: -0.000021 },
        { market_id: 1, exchange: "lighter", symbol: "BTC", rate: 0.000096 },
      ],
    },
    "query market book": {
      code: 200,
      total_asks: 3,
      total_bids: 3,
      bids: [
        { order_index: 1, price: String(mark - 10), initial_base_amount: "1", remaining_base_amount: "1" },
      ],
      asks: [
        { order_index: 2, price: String(mark + 10), initial_base_amount: "1", remaining_base_amount: "1" },
      ],
    },
    "query market candles": {
      code: 200,
      r: "15m",
      c: [
        { t: 1, o: mark - 100, h: mark, l: mark - 120, c: mark - 50, v: 10, V: 1, i: 1 },
        { t: 2, o: mark - 50, h: mark + 20, l: mark - 60, c: mark, v: 12, V: 1, i: 2 },
      ],
    },
    "query auth status": {
      status: "ok",
      auth_capable: false,
      host: "https://mainnet.zklighter.elliot.ai",
      account_index: null,
      api_key_index: null,
      sources: {},
      credentials_file: { path: "/tmp/credentials", present: false, mode_secure: null },
      missing: ["LIGHTER_API_PRIVATE_KEY"],
    },
    "paper status": {
      status: "ok",
      collateral: 10_000,
      initial_collateral: 10_000,
      tier: "premium",
      taker_fee_bps: 2.8,
      maker_fee_bps: 0.4,
      unrealized_pnl: 0,
      total_pnl: 0,
      positions_count: 0,
      trades_count: 0,
      state_path: "/tmp/paper.json",
    },
    "paper positions": { positions: [] },
    "paper health": {
      status: "healthy",
      total_account_value: 10_000,
      initial_margin_requirement: 0,
      maintenance_margin_requirement: 0,
      margin_usage: 0,
      leverage: 0,
      collateral: 10_000,
      tier: "premium",
      taker_fee_bps: 2.8,
      maker_fee_bps: 0.4,
    },
    "paper init": {
      status: "ok",
      collateral: 10_000,
      tier: "premium",
      taker_fee_bps: 2.8,
      maker_fee_bps: 0.4,
      state_path: "/tmp/paper.json",
    },
    "paper order market": {
      status: "ok",
      symbol: "BTC",
      market_id: 1,
      side: "long",
      order_type: "market",
      filled_size: 0.001,
      avg_price: mark,
      total_fee: 0.235,
      quote_amount: 84,
      unfilled: 0,
      liquidated: false,
      fills_count: 1,
    },
    "paper order ioc": {
      status: "ok",
      symbol: "BTC",
      market_id: 1,
      side: "long",
      order_type: "ioc",
      limit_price: mark + 50,
      filled_size: 0.001,
      avg_price: mark,
      total_fee: 0.235,
      quote_amount: 84,
      unfilled: 0,
      liquidated: false,
      fills_count: 1,
    },
  };
  return { ...base, ...overrides };
}
