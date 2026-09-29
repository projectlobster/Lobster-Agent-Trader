import { getAll, getOne, run } from "./db";

export type OrderRecord = {
  id: number;
  run_id: string;
  engine: string;
  symbol: string;
  side: string;
  order_type: string;
  amount: number;
  price: number | null;
  notional_usd: number | null;
  client_order_index: string | null;
  filled_size: number | null;
  avg_price: number | null;
  fee: number | null;
  raw_json: string;
  created_at: string;
};

export function insertOrder(input: {
  runId: string;
  engine: string;
  symbol: string;
  side: string;
  orderType: string;
  amount: number;
  price?: number | null;
  notionalUsd?: number | null;
  clientOrderIndex?: string | number | null;
  filledSize?: number | null;
  avgPrice?: number | null;
  fee?: number | null;
  raw: unknown;
}): void {
  run(
    `INSERT INTO orders (
       run_id, engine, symbol, side, order_type, amount, price, notional_usd,
       client_order_index, filled_size, avg_price, fee, raw_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.runId,
    input.engine,
    input.symbol,
    input.side,
    input.orderType,
    input.amount,
    input.price ?? null,
    input.notionalUsd ?? null,
    input.clientOrderIndex === null || input.clientOrderIndex === undefined
      ? null
      : String(input.clientOrderIndex),
    input.filledSize ?? null,
    input.avgPrice ?? null,
    input.fee ?? null,
    JSON.stringify(input.raw),
    new Date().toISOString(),
  );
}

export function listOrders(limit = 50, symbol?: string) {
  if (symbol) {
    return getAll<OrderRecord>(
      "SELECT * FROM orders WHERE symbol = ? ORDER BY created_at DESC LIMIT ?",
      symbol,
      Math.min(limit, 200),
    );
  }
  return getAll<OrderRecord>(
    "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?",
    Math.min(limit, 200),
  );
}

export function lastOrderAt(engine?: string, symbol?: string): string | null {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (engine) {
    clauses.push("engine = ?");
    params.push(engine);
  }
  if (symbol) {
    clauses.push("symbol = ?");
    params.push(symbol.toUpperCase());
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const row = getOne<{ created_at: string }>(
    `SELECT created_at FROM orders ${where} ORDER BY created_at DESC LIMIT 1`,
    ...params,
  );
  return row?.created_at ?? null;
}
