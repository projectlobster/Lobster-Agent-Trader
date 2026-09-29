# Lobster Agent Trader

**Turn the AI tokens you never spend into positions that actually run.**

You already pay for a monthly AI token allowance. Whatever you don't spend on ordinary
work normally just expires — silently, invisibly, and in full. Lobster Agent Trader turns
that remainder into an explicit number the agent is allowed to burn, then puts it to work
trading on Lighter.

You bring your own keys. Nothing is bundled, nothing is shared, and the credentials never
enter the database.

---

## What it actually does

```
allowance ledger → market snapshot → LLM decision → guardrails → order → ledger
```

One loop. Every step is recorded, and every decision leaves a row you can open and inspect —
the market snapshot the model saw, its reasoning, the guardrail that stopped it if one did,
and the fill that resulted or didn't.

- **Spends a budget you declared, not one you forgot.** Set your monthly allowance and how
  much of it is reserved for real work. The difference is what the agent may burn. When it's
  gone, the engine stops.
- **Decides from real market data.** Order book depth, candles, funding rate, and position
  limits are pulled from Lighter, compressed into a compact snapshot, and handed to the model.
- **Explains itself.** Every decision carries a thesis, an invalidation condition, and a
  horizon. Open any run to see the exact prompt, the raw reply, and the parsed result.
- **Books honestly.** Orders are recorded at their actual fill — quantity times price — not at
  the intended size. Zero fills and partial fills are both recorded as what they are, so the
  ledger never contains phantom positions.
- **Stops itself.** Hard guardrails run before an order is ever built, and a blocked decision
  is filed as `blocked` with the reason rather than quietly dropped.

## Built to be watched, not trusted

An autonomous trader that can lose money needs to be inspectable. Three things make that
possible here.

**The model never touches a command line.** It returns structured values — action, symbol,
side, size, confidence — which local code converts into an order. There is no path from prompt
text to shell arguments.

**Guardrails clamp, they don't scale up.** A $250 notional cap means an oversized request is
cut down to $250, never raised. Defaults: BTC/ETH/SOL only, 3× leverage, 3 concurrent
positions, a 300-second per-symbol cooldown, a 0.55 confidence floor, 48 cycles per day, and a
$20 daily loss limit that halts the engine when it trips. The daily cycle count and the loss
limit are both checked *before* any tokens are spent, so a stopped engine costs nothing.

**Live trading takes three independent unlocks.** The server environment variable
`LIGHTER_ENABLE_LIVE=1`, the live switch in Settings, and typing `LIVE` to confirm in the UI.
Any one missing and the engine refuses to start. Orders are booked by actual fill, and
`close_all` requires typing an explicit confirmation string.

## Your keys, your machine

This is a single-user, self-hosted tool. There are no accounts and no multi-tenancy — which
also means the defaults are deliberately narrow.

- **Lighter private key** — pasted into Settings, or written to
  `~/.lighter/lighter-agent-kit/credentials`. It goes straight to the file the agent kit reads,
  with owner-only permissions, and is never stored in the database or sent back to the browser.
  The API only ever reports whether one is present.
- **Model API key** — OpenRouter, Anthropic, or OpenAI. Stored locally, never echoed back.
  A key belonging to one provider is never sent to another.
- **Binds to `127.0.0.1` by default.** Set `LIGHTER_TRADER_PASSWORD` and put a TLS-terminating
  reverse proxy in front before exposing it to anything else. Cross-site requests to any
  write endpoint are rejected regardless of whether a password is set.

Nothing leaves your machine except the model request and the Lighter API calls you expect.

## Start in paper mode

Paper trading is the default, and it is a genuine simulation rather than a mock: it runs the
real agent loop, spends real tokens, and books real fills against a simulated account. It also
has structural limits worth knowing before you read too much into its numbers — it fills only
against taker liquidity, never models order-book impact, latency, or partial fills, does not
charge funding, and is cross-margin only. Paper results validate the decision logic and the
token spend. They are not a return forecast.

Prove a strategy on testnet before it touches mainnet. Live orders and withdrawals cannot be
reversed.

## Getting started

```bash
npm install
npm run setup     # checks node/python, installs the agent kit, preloads the SDK, creates the paper account
cp .env.example .env.local
# add your model API key
npm run dev       # prints the URL it bound to
```

Then open the console, paste your Lighter key under **Settings → Lighter**, and press
**Run once**. Read the run it produces before you let it loop.

`npm run engine -- --interval 300` runs the same loop headless for unattended use.

## Under the hood

Built on the official [lighter-agent-kit](https://github.com/elliottech/lighter-agent-kit),
which handles market data, precision, signing, and broadcast. This project adds the allowance
ledger, structured decisions, guardrails, and the audit trail.

- **Pages** `src/app/**` — landing and console, reading the service layer directly
- **API** `src/app/api/**` — mutations and client polling only
- **Agent** `src/lib/agent/` — snapshot → prompt → schema → guardrails → loop → engine
- **LLM** `src/lib/llm/` — Anthropic / OpenAI / OpenRouter with usage normalisation
- **Storage** `src/lib/store/` — `node:sqlite`, built into Node 22.5+, no native dependencies

A cycle's cost is dominated by process spawns, not by tokens. Slow-moving reads — market
metadata, 24h stats, funding, settled candles — go through a TTL cache that coalesces
concurrent duplicate requests, which cut a three-symbol snapshot from 16.7s to 5.9s. Order
books and account state are never cached.

---

*Lobster Agent Trader is experimental software. Submitted orders and withdrawals cannot be
reversed. The regulatory status of crypto trading varies by jurisdiction — check your own.
Prove a strategy on testnet first, and only trade what you can afford to lose.*
