# Lobster Agent Trader

## Product Introduction

---

### 1. The problem

Every few months, developers receive a fresh block of AI tokens. Some get used. Most expire.
A typical subscription might include a million tokens a month, of which a working professional
spends a fraction on the tasks it was bought for. The rest does not roll over, does not cash
out, and does not warn you on the way out. It evaporates on a schedule nobody set for this
purpose.

There is a second, less obvious waste. Financial models that run continuously — a risk engine, an
allocation strategy, a hedging routine — are too small to justify a human's attention and too
repetitive for a human to do well. You do not want to wake up and check whether the rebalancing
ran; you want it to have run, logged what it decided, and refused to act when the numbers did
not justify acting.

Lobster Agent Trader does both. It takes an allowance you were going to lose anyway, gives it a
ledger and a ceiling, and runs a disciplined trading loop on Lighter — an exchange with a public
API, published documentation, and testnets you can prove a strategy on first.

**It is not a black box that trades your money.** It is a loop you can pause, a log you can read,
and a set of limits the model cannot argue with.

### 2. Who it is for

**You have an expiring allowance and nothing better to do with it.** The budget is already
yours; the only question is whether it converts into anything.

**You want an experiment, not a service.** No accounts, no subscription, no telemetry.

**You are building automated trading systems.** The guardrail defaults, prompt structure, schema,
and failure handling are all readable and testable. Parts of this codebase exist because review
found a real bug, and each fix came with a regression test.

**You are cautious.** Start in paper mode — the real loop against a simulated account, costing
only tokens you were spending anyway.

### 3. The allowance model

Most "AI budget" tooling treats spending as a reporting problem. This treats it as a control
problem. You declare your monthly token budget and the portion reserved for ordinary work; the
difference is the tradable allowance:

```
tradable allowance = monthly token budget − reserved for real work + carry-over
```

The reserved portion is never touched — not by a bug, not by a runaway loop, not by a clever
model. Optional carry-over rolls unspent allowance forward; changing the budget applies to the
current period, past periods stay frozen.

The projection of what the next cycle costs matters, because the obvious implementation is
wrong. Reading `maxOutputTokens` as a per-call cost assumes every call burns its entire ceiling,
so the engine would stop while a substantial budget remained. It instead uses the **average
output of recent calls**, estimating input by character type.

Two limits are checked *before* the model is called: the projected allowance and the daily cycle
cap. Checked afterwards, the engine would learn it was not allowed to run only by spending a
full cycle's tokens finding out — then do it again next interval. Pre-flight checking means a
stopped engine costs nothing. Cooldowns are exempt: one is per-symbol, and the model may pick
another.

### 4. How a decision is made

**The allowance gate** skips the cycle cheaply if the budget cannot cover it, without touching
the market data APIs.

**The market snapshot** gathers order book and depth, candles, funding rate, precision, and
minimum size for each allow-listed symbol, compressed into compact text. One detail took
measurement: **funding rate comes from Lighter's own data, not Binance's.** Cross-exchange rates
do not even reliably share a sign — SOL was -0.0021% on Binance (shorts pay) and +0.0064% on
Lighter (longs pay). Reading the wrong row inverts the carry signal, and a model handed an
inverted signal reaches the wrong conclusion confidently.

**The decision** must be strict JSON:

```json
{
  "action": "open | close | hold",
  "symbol": "BTC",
  "side": "long | short",
  "size_usd": 250,
  "confidence": 0.72,
  "thesis": "why now",
  "invalidation": "what would prove this wrong",
  "horizon": "intraday"
}
```

A successful response is parsed, validated, and *recorded* — token usage goes into the ledger
regardless. On validation failure the zod errors are fed back for a repair attempt, at most
twice; a second failure is recorded as an `error` with the provider's diagnostic, because
"malformed output" and "ran out of budget mid-thought" deserve different records.

**Execution** converts `size_usd` into a base amount rounded down to market precision and
passes an argument array to the kit. The model never touches command-line arguments, so there
is no path from prompt text to shell invocation.

**Booking** records orders at their **actual fill** — filled size × fill price — not the size
requested. Zero fills are recorded as `blocked`, partial fills at the quantity that traded. Book
by intent and the ledger fills with orders no position supports.

### 5. Guardrails, and why they clamp

These run before an order is constructed, each returning its own reason. A blocked decision is
filed with those reasons attached, not silently discarded — a decision that was prevented is
the one worth reading about.

| Guardrail | Default |
|---|---|
| Tradable symbol allow-list | BTC, ETH, SOL |
| Max notional per trade | $250 |
| Account leverage cap | 3× (settings API hard-caps at 5×) |
| Max concurrent positions | 3 |
| Daily cycle cap | 48 |
| Minimum interval between orders | 300s, per symbol |
| Minimum confidence | 0.55 |
| Daily loss limit | $20 |

The word that matters is **clamp**: an oversized request is cut down to the limit, never scaled
up. There is no code path by which a model asking for more gets more.

The confidence floor is a prompt instruction as much as a filter — the model is asked to return
`hold` rather than a low-conviction trade, with the guardrail as backstop. The daily loss limit
stops the engine entirely: a strategy that has lost its budget has already told you something.

Some constraints are structural: spot pairs are always rejected, paper accepts only `market` and
`ioc`, live only `market`, and an `ioc` without a `limit_price` is refused — not theoretically, a
free model really did return one that way.

### 6. Live trading takes three locks

Real orders cannot be reversed, so the path to live is deliberately narrow. Three things must
all be true: the server environment sets `LIGHTER_ENABLE_LIVE=1`; the live switch is on in
Settings (the API refuses to enable it without the first); and someone types `LIVE` to confirm.

Any one missing and the engine refuses to start, with a specific reason. Starting live also
calls `auth status` to confirm credentials resolve — finding a missing key at startup beats
finding it as an order rejects.

`close_all` requires typing a confirmation string and stops the engine first, so no cycle can
open a position mid-close. If the broadcast then fails the engine restarts, because leaving it
stopped while positions are open would look like a deliberate halt.

### 7. Where your credentials live

**The Lighter private key is never stored in the database.** It is written to
`~/.lighter/lighter-agent-kit/credentials` with owner-only permissions. The API reports only
whether a key is present, never its value, and the browser never receives it.

**The model API key is never echoed back** — the interface returns `apiKeySet: true` and
nothing more. **A key belongs to one provider:** probing a different provider without its own
environment variable is refused with an explanation, rather than sending one vendor's secret to
a competitor's API. This was a real vulnerability found in review; it now has regression tests.

**The database is owner-only** — `data/` is `0700`, the database and its WAL/SHM siblings `0600`.
What those permissions do *not* cover: the model API key inside it is plaintext, because
`node:sqlite` has no encryption. `0700` blocks other users on the same machine, not a disk
snapshot, a cloud backup, or a container volume. If that matters, use `.env.local`.

### 8. Deploying it yourself

This is a single-user application by design. No accounts, no sessions, no tenant isolation —
every route shares one database and one private key. It should not be run as a public service.

Under that assumption the defaults are narrow on purpose: it binds `127.0.0.1`, an unset
`LIGHTER_TRADER_PASSWORD` means no authentication, and every write validates `Sec-Fetch-Site` /
`Origin`. The last applies regardless of the password, because browsers attach cached basic
credentials to same-origin requests — without it a malicious page could drive your console
through your login.

Setting a password requires HTTP Basic Auth everywhere, compared in constant time. An earlier
version decoded the header as Latin-1, silently locking out anyone whose password contained a
`ü` or a Chinese character; there is a regression test now.

To reach it from another machine, set a password and put a TLS-terminating reverse proxy in
front — basic auth over cleartext HTTP is not encryption. An SSH tunnel suits occasional access.

### 9. Paper mode, honestly

Paper is the default, and the console labels it prominently, because paper results are not live
results:

- Only taker orders fill; a maker order never fills.
- No order-book impact — eating three levels does not move the market.
- No latency, no partial fills.
- **No funding cost.** On a position held overnight this is often the dominant P&L factor.
- Cross-margin only.

A strategy that looks excellent in paper and bleeds in live is usually bleeding on funding or on
maker fills paper never gave it. Read paper as validation of logic and token spend, not a
return forecast.

### 10. Deployments, running it, and what it is built on

All four deployments are selectable under **Settings → Lighter agent kit → Deployment** or
pinned with `LIGHTER_HOST`:

| Deployment | URL |
|---|---|
| Lighter mainnet | `https://mainnet.zklighter.elliot.ai` |
| Lighter testnet | `https://testnet.zklighter.elliot.ai` |
| Robinhood Lighter | `https://api.rh.lighter.xyz` |
| Robinhood Lighter testnet | `https://api.rh-testnet.lighter.xyz` |

**Credentials are per-deployment.** Account indices and API keys are issued for a specific
network, so switching deployments means switching your credential bundle as a whole. Caches are
keyed per host, so a stale symbol map cannot survive the switch.

Two paths run the loop, sharing one cross-process lease so they can never place orders
simultaneously. The console's Start / Run once is interactive, with the timer inside the web
server — a restart kills it. `npm run engine` is headless. The console warns when the engine
claims to be running but no decision has appeared for three intervals.

The official [Lighter agent kit](https://github.com/elliottech/lighter-agent-kit) handles
market metadata, precision conversion, signing, and broadcast; reimplementing that would only
introduce risk where mistakes are most expensive. This project adds the allowance ledger,
structured decisions, guardrails, and the audit trail. Storage is `node:sqlite`, built into
Node 22.5+, so `npm install` compiles nothing.

**A cycle's real cost is process count, not tokens** — every kit call is a fresh Python process,
and a three-symbol cycle originally needed thirteen. A TTL cache took a snapshot from 16.7s to
5.9s. Order books and account state are never cached: a stale price is worse than a slow one.

### 11. Getting started

```bash
npm install
npm run setup      # checks node/python, installs the kit, preloads the SDK, creates the paper account
cp .env.example .env.local
# add your model API key
npm run dev        # prints the URL it bound to
```

Paste your Lighter key under **Settings → Lighter**, press **Run once**, and read what comes
back before you let it loop.

A static preview of the landing page is at
<https://projectlobster.github.io/Lobster-Agent-Trader/>. The console is not part of it — a
static host cannot run a server, Python, or a database.

**Prove a strategy on testnet first. Only trade what you can afford to lose.**

---

*Lobster Agent Trader is experimental software. Submitted orders and withdrawals cannot be
reversed. The regulatory status of crypto trading varies by jurisdiction — check your own.*
