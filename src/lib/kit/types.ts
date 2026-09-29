export type KitErrorEnvelope = {
  error: string;
  detail?: string;
};

export type HealthResponse = {
  status: string;
  version: string;
};

export type AuthStatus = {
  status: string;
  auth_capable: boolean;
  host: string;
  account_index: number | null;
  api_key_index: number | null;
  sources: Record<string, string | null>;
  credentials_file: {
    path: string;
    present: boolean;
    mode_secure: boolean | null;
  };
  missing: string[];
};

export type MarketType = "perp" | "spot";

export type MarketListItem = {
  symbol: string;
  market_index: number;
  market_type: MarketType;
};

export type MarketListResponse = {
  code: number;
  markets: MarketListItem[];
  filter_hint?: string;
};

export type MarketInfoRow = {
  symbol: string;
  market_id: number;
  market_type: MarketType;
  status: string;
  taker_fee: string;
  maker_fee: string;
  min_base_amount: string;
  min_quote_amount: string;
  supported_size_decimals: number;
  supported_price_decimals: number;
  supported_quote_decimals: number;
  open_interest?: string;
  order_quote_limit?: string;
  is_maker_fee_enabled?: boolean;
  is_taker_fee_enabled?: boolean;
};

export type MarketInfoResponse = {
  code: number;
  order_books: MarketInfoRow[];
};

export type BookLevel = {
  order_index: number;
  price: string;
  initial_base_amount: string;
  remaining_base_amount: string;
};

export type MarketBookResponse = {
  code: number;
  total_asks: number;
  total_bids: number;
  asks: BookLevel[];
  bids: BookLevel[];
};

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  V: number;
  i: number;
};

export type CandlesResponse = {
  code: number;
  r: string;
  c: Candle[];
};

export type FundingRateRow = {
  market_id: number;
  exchange: string;
  symbol: string;
  rate: number;
};

export type FundingResponse = {
  code: number;
  funding_rates: FundingRateRow[];
};

export type ExchangeStatsRow = Record<string, unknown>;

export type ExchangeStatsResponse = {
  code: number;
  order_book_stats: ExchangeStatsRow[];
  [key: string]: unknown;
};

export type AccountPosition = {
  market_id: number;
  symbol: string;
  sign: number;
  position: string;
  avg_entry_price: string;
  position_value: string;
  unrealized_pnl: string;
  realized_pnl: string;
  liquidation_price: string;
  margin_mode: number;
  allocated_margin: string;
  initial_margin_fraction: string;
};

export type AccountRecord = {
  index: number;
  l1_address: string;
  account_type: number;
  account_trading_mode: number;
  collateral: string;
  available_balance: string;
  positions: AccountPosition[];
  assets: Array<{
    symbol: string;
    asset_id: number;
    balance: string;
    locked_balance: string;
    margin_balance: string;
    margin_mode: string;
  }>;
};

export type AccountInfoResponse = {
  code: number;
  total: number;
  accounts: AccountRecord[];
};

export type OrderRow = {
  order_index: number;
  client_order_index: number;
  order_id: string;
  client_order_id: string;
  market_index: number;
  is_ask: boolean;
  type: string;
  time_in_force: string;
  status: string;
  initial_base_amount: string;
  remaining_base_amount: string;
  filled_base_amount: string;
  filled_quote_amount: string;
  price: string;
  reduce_only: boolean;
};

export type OrdersResponse = {
  code: number;
  orders: OrderRow[];
};

export type PaperStatusResponse = {
  status: string;
  collateral: number;
  initial_collateral: number;
  tier: string;
  taker_fee_bps: number;
  maker_fee_bps: number;
  unrealized_pnl: number;
  total_pnl: number;
  positions_count: number;
  trades_count: number;
  state_path: string;
  warnings?: { refresh_failed: Record<string, string> };
};

export type PaperPosition = {
  symbol: string;
  market_id: number;
  side: "long" | "short";
  size: number;
  avg_entry_price: number;
  mark_price: number;
  unrealized_pnl: number;
  realized_pnl: number;
  liquidation_price: number;
};

export type PaperPositionsResponse = {
  positions: PaperPosition[];
  warnings?: { refresh_failed: Record<string, string> };
};

export type PaperTrade = {
  symbol: string;
  market_id: number;
  side: "buy" | "sell";
  size: number;
  price: number;
  fee: number;
  realized_pnl: number;
  is_liquidation: boolean;
  timestamp: string;
};

export type PaperTradesResponse = {
  trades: PaperTrade[];
};

export type PaperHealthResponse = {
  status: string;
  total_account_value: number;
  initial_margin_requirement: number;
  maintenance_margin_requirement: number;
  margin_usage: number;
  leverage: number;
  collateral: number;
  tier: string;
  taker_fee_bps: number;
  maker_fee_bps: number;
};

export type PaperOrderResponse = {
  status: string;
  symbol: string;
  market_id: number;
  side: "long" | "short" | "buy" | "sell";
  order_type: "market" | "ioc";
  limit_price?: number;
  filled_size: number;
  avg_price: number;
  total_fee: number;
  quote_amount: number;
  unfilled: number;
  liquidated: boolean;
  fills_count: number;
};

export type PaperInitResponse = {
  status: string;
  collateral: number;
  tier: string;
  taker_fee_bps: number;
  maker_fee_bps: number;
  state_path: string;
};

export type TradeSubmitResponse = {
  status: string;
  tx_hash: string;
  client_order_index?: number;
  effective_amount?: string;
  effective_price?: string;
  side?: string;
  tx?: unknown;
};

export type TradeCloseAllPreview = {
  status: string;
  preview: true;
  note?: string;
  would_close: Array<{
    symbol: string;
    market_id: number;
    current_side: "long" | "short";
    closing_side: "long" | "short";
    amount: string;
  }>;
};

export type TradeCloseAllResult = {
  status: "ok" | "partial" | "error";
  closed: Array<{
    symbol: string;
    market_id: number;
    closing_side: "long" | "short";
    amount: string;
    client_order_index: number;
    tx_hash: string;
  }>;
  failed: Array<{ symbol?: string; market_id?: number; error: string }>;
  cancelled_orders_first?: boolean;
  cancel_all_tx_hash?: string;
  cancel_all_error?: string;
  warning?: string;
};
