# Lobster Agent Trader

## Product Introduction

---

### 1. The problem

Every few months, developers and researchers receive a fresh block of AI tokens. Some get
used. Most expire.

This is not a rounding error. A typical subscription might include a million tokens a month, and
a working professional might spend a fraction of it on the tasks it was bought for. The
remainder does not roll over, does not cash out, and does not warn you on the way out. It
evaporates on a schedule nobody set for this purpose.

The rational response is to not think about it. Which is precisely why it is worth a system.

There is a second, less obvious waste. Financial models that run continuously — a risk engine, an
allocation strategy, a hedging routine — are exactly the kind of workload too small to justify a
human's attention and too repetitive for a human to do well. You do not want to wake up and
check whether the rebalancing ran. You want it to have run, to have logged what it decided, and
to have refused to act when the numbers did not justify acting.

Lobster Agent Trader is built for both. It takes an allowance you were going to lose anyway,
gives it a ledger and a ceiling, and puts it to work running a disciplined trading loop on
Lighter — an exchange with a public API, published documentation, and testnets you can prove a
strategy on before it touches real money.

### 2. What it is

Lobster Agent Trader is a self-hosted web application. You run it on your own machine. It
connects to an LLM provider of your choice, reads market data from Lighter, asks the model for a
structured trading decision, checks that decision against hard limits, and executes what
survives.

The loop is deliberately small:

```
allowance ledger → market snapshot → LLM decision → guardrails → order → ledger
```

Each stage has one job, and each stage leaves a record. The point of the design is not that any
single stage is clever. It is that you can reconstruct exactly what happened, what the model was
looking at when it happened, and what stopped it when something went wrong.

**It is not a black box that trades your money.** It is a loop you can pause, a log you can read,
and a set of limits the model cannot argue with.

### 3. Who it is for

**You have an expiring AI allowance and nothing better to do with it.** This is the primary case.
The budget is already spent in the sense that it is already yours; the only question is whether
it converts into anything at all.

**You want an experiment, not a service.** There are no accounts here, no subscription, no
telemetry, and no vendor relationship. It runs until you stop it.

**You are building or evaluating automated trading systems.** Every design decision is in the
open. The guardrail defaults, the prompt structure, the schema, the failure handling — all
readable, all testable, all yours to change. Several parts of this codebase exist because a
reviewer found a real bug, and the fix came with a regression test.

**You are cautious.** Then start in paper mode, read the runs, and stay there as long as you
like. Paper mode is not a mock; it runs the real loop against a simulated account. What it costs
you is tokens, which you were spending anyway.

### 4. How the allowance model works

Most "AI budget" tooling treats spending as a reporting problem. This treats it as a control
problem.

You declare two numbers. The first is your monthly token budget — the total your plan gives you.
The second is the amount you have reserved for ordinary work, the portion you are certain will go
to the tools you already use it for. The difference is the tradable allowance:

```
tradable allowance = monthly token budget − reserved for real work + carry-over
```

The reserved portion is never touched — not by a bug, not by a runaway loop, not by a clever
model. It is not available.

Carry-over is optional. When enabled, unspent allowance rolls into the next period, so an
uneventful month is not wasted. Changing the monthly budget applies to the current period
immediately; past periods stay frozen, so the history stays internally consistent.

The projection of "what will the next cycle cost" is worth a note, because the obvious
implementation is wrong. Reading `maxOutputTokens` as a per-call cost assumes every call consumes
its entire ceiling, so the engine would stop while a substantial budget remained. Instead it uses
the **average output of recent calls**, and estimates input by character type — roughly one token
per CJK character, four characters per token for Latin text.

Two limits are checked *before* the model is called: the projected allowance and the daily cycle
cap. This matters more than it sounds. Checked afterwards, the engine would learn it was not
allowed to run only by spending a full cycle's tokens finding out — then do it again next
interval. Pre-flight checking means a stopped engine costs nothing.

Cooldowns are exempt, instructively: a cooldown is per-symbol, and the model may pick a
different one, so refusing the whole cycle because BTC is cooling would be wrong.

### 5. How a decision is made

**The allowance gate.** A cheap arithmetic check. If the budget cannot cover another cycle, the
loop records a `skipped` run and stops, without touching the market data APIs.

**The market snapshot.** Order book and depth, a candle series, funding rate, contract precision,
and minimum order size for every allow-listed symbol — gathered through the official Lighter
agent kit and compressed into compact text before it reaches the prompt. A verbose snapshot would
eat the budget that was supposed to be trading it.

One detail that took measurement to get right: **funding rate is read from Lighter's own data,
not from Binance's.** Cross-exchange rates do not even reliably share a sign — during development
SOL was at -0.0021% on Binance (shorts pay) and +0.0064% on Lighter (longs pay). Reading the
wrong row inverts the carry signal handed to the model, and a model handed an inverted signal
will confidently reach the wrong conclusion.

**The decision.** The model must return strict JSON with a fixed shape:

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

A successful response is parsed, validated, and *recorded* — the actual token usage goes into the
ledger regardless of what happens next. If validation fails, the zod errors are fed back for a
repair attempt, at most twice. A second failure is recorded as an `error` with the provider's own
diagnostic, because "the model produced malformed output" and "the model ran out of output budget
mid-thought" are different problems and deserve different records.

**The guardrails.** See below.

**Execution.** Local code converts `size_usd` into a base amount, rounding down to the market's
precision, and passes an argument array to the kit. The model never touches command-line
arguments — it emits structured values, and separate code builds the command. There is no path
from prompt text to shell invocation, which closes off a class of prompt-injection attack that
matters more here than in most applications.

**Booking.** Orders are recorded at their **actual fill** — filled size × fill price — not at the
size requested. A zero fill is recorded as `blocked` with a reason; a partial fill is recorded at
the quantity that actually traded. Book by intent and the ledger slowly fills with orders no
position supports.

### 6. Guardrails, and why they clamp

The guardrails run before an order is constructed. Each returns its own reason, and a blocked
decision is filed as a `blocked` run with those reasons attached — not silently discarded, because
a decision that was prevented is exactly the one you want to read about.

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

The word that matters in the notional row is **clamp**. An oversized request is cut down to the
limit, never scaled up. There is no code path by which a model asking for more gets more.

Two of these are worth expanding on.

**The confidence floor is a prompt instruction as much as a filter.** Suggestions below 0.55 are
discarded, which would waste a cycle. So the model is told about the threshold up front and asked
to return `hold` instead of a low-conviction trade. The guardrail is the backstop; the
instruction is the primary path.

**The daily loss limit stops the engine.** It does not merely block the next order. When it
trips, the loop halts, because a strategy that has lost its daily budget has already told you
something important.

There are also constraints that are not configurable, because they are structural rather than
preferences. Spot pairs — anything containing a `/` — are always rejected. Paper mode accepts
only `market` and `ioc`; live mode accepts only `market`. An `ioc` order without a `limit_price`
is refused, and that one is not theoretical: during testing, a free model really did return
`order_type: "ioc"` with `limit_price: null`.

### 7. Live trading takes three locks

Real orders cannot be reversed, so the path to live is deliberately narrow. Three things must all
be true:

1. The server environment sets `LIGHTER_ENABLE_LIVE=1`.
2. The live switch is turned on in Settings. The API refuses to enable it without the first.
3. Someone types `LIVE` in the Agent page to confirm the switch.

Any one missing and the engine refuses to start, with a specific reason rather than a generic
failure. Before a live run starts, the system also calls `auth status` to confirm credentials are
actually resolvable — discovering a missing key at startup is much better than discovering it as
an order rejects.

`close_all` requires typing an explicit confirmation string before it will flatten positions, and
it stops the engine first so no new cycle can open a position mid-close. If the broadcast then
fails, the engine is restarted, because leaving it stopped while positions are still open would
look like a deliberate halt.

### 8. Where your credentials live

The private key is the thing to be most careful about, so the handling is worth stating plainly.

**The Lighter private key is never stored in the database.** It is written to
`~/.lighter/lighter-agent-kit/credentials`, the file the official agent kit reads, with
owner-only permissions. You can paste it into Settings or write the file yourself — both are the
same path. The API reports only whether a key is present, never its value, and the browser never
receives it.

**The model API key is never echoed back.** It can live in `.env.local` or in the local database;
either way the interface returns `apiKeySet: true` and nothing more.

**A key belongs to one provider.** The stored key belongs to whichever provider was selected when
it was saved. Probing a different provider without its own environment variable is refused with an
explanation, rather than sending one vendor's secret to a competitor's API. This was a real
vulnerability found in review; it now has four regression tests.

**The database is owner-only** — `data/` is `0700`, the database and its WAL and SHM siblings are
`0600`. This is best effort: on a filesystem that refuses `chmod`, default permissions persist.

What those permissions do *not* cover: the model API key in the database is plaintext, because
`node:sqlite` has no encryption. `0700` blocks other users on the same machine, not a disk
snapshot, a cloud backup, or a container volume. If that matters, put the key in `.env.local`.

### 9. Deploying it yourself

This is a single-user application, and it is designed as one. There is no account system, no
session handling, no tenant isolation — every route shares one database and one private key. It
should not be run as a public service.

Under that assumption, the defaults are narrow on purpose:

| Measure | Default |
|---|---|
| Bind address | `127.0.0.1` — reachable only from your machine |
| Access password | Unset means no authentication |
| Cross-site requests | Every write validates `Sec-Fetch-Site` / `Origin`; cross-site origins get 403 |

Not authenticating when no password is set is a deliberate choice: on a single-user local setup,
a password prompt is friction with no security benefit. The bind address is what actually
provides that benefit, which is why it is the first thing configured.

If you set `LIGHTER_TRADER_PASSWORD`, every page and API call requires HTTP Basic Auth. The
comparison is constant-time, and non-ASCII passwords work — an earlier version decoded the header
as Latin-1, which silently locked out anyone whose password contained a `ü` or a Chinese
character. There is a regression test for that now.

Cross-site rejection applies regardless of whether a password is set, because browsers attach
cached basic credentials to same-origin requests. Without that check, a malicious page could
drive your console through your own login.

To reach it from another machine, set a password and put a TLS-terminating reverse proxy in
front. Basic auth over cleartext HTTP is not encryption, and the README says so plainly. An SSH
tunnel is the right answer for occasional access.

### 10. Paper mode, honestly

Paper trading is the default, and the console labels it prominently — because paper results are
not live results, and the differences are structural rather than cosmetic:

- Only taker orders fill. A maker order never fills.
- No order-book impact. Eating three levels in paper does not move the market.
- No latency, no partial fills.
- **No funding cost.** On a position held overnight, this is often the dominant P&L factor.
- Cross-margin only.

A strategy that looks excellent in paper and bleeds in live is usually bleeding on funding or on
maker fills that paper never gave it. Read paper results as validation of decision logic and token
spend — which is what they are good for — and not as a return forecast.

### 11. Both exchanges

Lobster Agent Trader supports all four Lighter deployments:

- Lighter mainnet
- Lighter testnet
- **Robinhood Lighter** (`https://api.rh.lighter.xyz`)
- **Robinhood Lighter testnet** (`https://api.rh-testnet.lighter.xyz`)

The deployment is selected from the Settings page or pinned with `LIGHTER_HOST`, and the kit
resolves everything else from that URL. Caches are keyed per host, so switching networks does not
poison a cached symbol map, and the response cache is cleared on a deployment change so a stale
read cannot survive the switch.

One thing to know: **credentials are per-deployment.** Account indices and API keys are issued
for a specific network, so switching deployments means switching your credential bundle as a
whole. Since `LIGHTER_HOST` takes precedence over the host recorded in your credentials file,
the two can otherwise disagree — which is why the deployment field says so.

### 12. Running the loop

There are two ways to run it, and they share a single cross-process lease so they can never place
orders simultaneously:

- **The console's Start / Run once** — interactive. The timer lives inside the web server
  process, which means a restart kills it and a multi-worker deployment would run it more than
  once.
- **`npm run engine`** — headless, for unattended runs.

The console detects the first failure mode: if the engine claims to be running but no decision has
appeared for more than three intervals, the Agent page shows a warning and points you at the CLI
worker. This is the kind of thing that would otherwise be discovered by noticing that nothing was
happening.

### 13. What it is built on

The official [Lighter agent kit](https://github.com/elliottech/lighter-agent-kit) handles market
metadata, precision conversion, signing, broadcast, and error shaping. Reimplementing that would
only introduce risk in the two areas where mistakes are most expensive, so this project does not.

What this project adds is the allowance ledger, structured decisions, guardrails, and the audit
trail.

Storage is `node:sqlite`, built into Node 22.5 and later — no native dependencies, so `npm install`
does not compile anything. A cycle's real cost is process count rather than tokens: every kit call
is a fresh Python process plus several HTTPS round trips, and a three-symbol cycle originally
needed thirteen of them. Routing the slow-moving reads through a TTL cache that also coalesces
concurrent duplicate requests took a snapshot from 16.7 seconds to 5.9. Order books and account
state are never cached, because a stale price is worse than a slow one.

### 14. Getting started

```bash
npm install
npm run setup      # checks node/python, installs the kit, preloads the SDK, creates the paper account
cp .env.example .env.local
# add your model API key
npm run dev        # prints the URL it bound to
```

Paste your Lighter key under **Settings → Lighter**, press **Run once**, and read what comes
back before you let it loop.

A static preview of the landing page is published at
<https://projectlobster.github.io/Lobster-Agent-Trader/>. The console is not part of it — a static
host cannot run a server, a Python process, or a database.

**Prove a strategy on testnet first. Only trade what you can afford to lose.**

---

*Lobster Agent Trader is experimental software. Submitted orders and withdrawals cannot be
reversed. The regulatory status of crypto trading varies by jurisdiction — check your own.*
