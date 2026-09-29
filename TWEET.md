# Tweet — Lobster Agent Trader

**Platform:** X / Twitter
**Important:** X's limit is **280 characters per post** on a free account. Every version below
is therefore written as a **thread**, or marked as needing a paid account for single-post use.
Character counts are measured, not estimated.

**Verified at time of writing:** 147 tests passing; both links return 200.

---

## Option A — long-form post (X Premium only; 2,116 chars, well over the 280 free limit)

> If you have X Premium this posts as one long-form post. On a free account, use the
> 8-part thread below instead — every one of its posts is within 280.

Every month you pay for a million AI tokens and quietly use a fraction of them.

The rest doesn't roll over. Doesn't cash out. Doesn't warn you.

I built something for the remainder.

**Lobster Agent Trader** turns your expiring token allowance into a disciplined trading loop on Lighter:

```
allowance ledger → market snapshot → LLM decision → guardrails → order → ledger
```

You declare a monthly budget and the portion reserved for real work. The rest is what the agent may burn. When it's gone, the engine stops — before spending another token finding out it's not allowed to run.

What's in the box:

**Guardrails that clamp, never scale.** $250 max notional, 3× leverage, 3 concurrent positions, 0.55 confidence floor, $20 daily loss limit. An oversized request gets cut *down* to the limit. There is no code path where asking for more gets you more.

**Live trading takes three independent locks.** A server env var, a switch in Settings, and typing `LIVE` to confirm. Any one missing and the engine refuses to start.

**Every decision leaves a record** — including the ones the guardrails stopped. Blocked and errored rows sit next to the wins, because a product that trades your money should show you its failures first.

**The model never touches a command line.** It returns structured values; separate code builds the order. No path from prompt text to shell invocation.

Self-hosted. Your keys stay yours — the Lighter private key is written to the kit's credentials file with owner-only permissions, never into the database, never echoed back to the browser. Binds to 127.0.0.1 by default.

Paper mode is the default and it's an honest simulation, not a mock. It's also honest about its limits: taker fills only, no order-book impact, and no funding cost — which is often the dominant P&L factor overnight. Paper validates the decision logic. It is not a return forecast.

All four Lighter deployments: mainnet, testnet, and both Robinhood Lighter networks.

147 tests. One of them exists because a real free model returned `order_type: "ioc"` with `limit_price: null`.

↓ Live demo · Repo

https://projectlobster.github.io/Lobster-Agent-Trader/
https://github.com/projectlobster/Lobster-Agent-Trader

---

## Option A-thread — the same post as a 8-part thread (free account, all posts ≤ 280 chars)

**1/8**
Every month you pay for a million AI tokens and quietly use a fraction of them.

The rest doesn't roll over. Doesn't cash out. Doesn't warn you.

I built something for the remainder. 🧵

**2/8**
**Lobster Agent Trader** turns your expiring token allowance into a disciplined trading loop on Lighter.

allowance ledger → snapshot → LLM decision → guardrails → order → ledger

You set a monthly budget and the part reserved for real work. The rest is what it may burn.

**3/8**
When the budget runs out, the engine stops — *before* spending another token finding out it isn't allowed to run.

The remaining-budget check and the daily cycle cap both happen ahead of the model call, not after.

That detail is the whole design.

**4/8**
The guardrails **clamp, never scale**:

$250 max notional · 3× leverage · 3 concurrent positions · 0.55 confidence floor · $20 daily loss limit

Ask for $1000, you get $250. There is no code path where asking for more gets you more.

**5/8**
Live trading takes **three independent locks**:

1. `LIGHTER_ENABLE_LIVE=1` on the server
2. the live switch in Settings
3. typing `LIVE` to confirm

Miss one and the engine refuses to start, with a reason.

Friction on purpose: the failure mode is your money.

**6/8**
Every decision leaves a record — **including the ones the guardrails stopped**.

Blocked and errored rows sit next to the wins. A product that trades your money should show its failures first.

The model never touches a shell: structured values in, separate code builds the order.

**7/8**
Self-hosted. Your Lighter key goes to the kit's credentials file, owner-only — never in the database, never echoed back. Binds to 127.0.0.1 by default.

Paper mode is the default, and it states where it diverges from live (taker fills only, no funding cost) instead of pretending.

**8/8**
147 tests. One exists because a real model asked for an `ioc` order with no limit price.

↓ Repo + demo
https://github.com/projectlobster/Lobster-Agent-Trader
https://projectlobster.github.io/Lobster-Agent-Trader

---

## Option B — shorter, punchier (920 chars — still needs Premium; split 2-up on a free account)

You pay for a million AI tokens a month. Most expire. No rollover, no payout, no warning.

So I built a thing that spends the remainder, on your machine, under hard limits.

**Lobster Agent Trader** — an agentic trading loop on Lighter funded by tokens you were going to lose anyway.

- Guardrails **clamp, never scale**. $250 cap, 3× leverage, $20 daily loss limit. Ask for more, get less.
- Live trading needs **three independent unlocks**. Miss one, the engine won't start.
- Every decision is recorded — **including the ones guardrails blocked**.
- The model never touches a shell.
- Self-hosted, your keys, loopback by default.

Paper mode is the default, and it tells you where it diverges from live instead of pretending.

147 tests. Repo + live demo below.

https://github.com/projectlobster/Lobster-Agent-Trader
https://projectlobster.github.io/Lobster-Agent-Trader

---

## Option C — the hook-first version (highest engagement, riskiest)

I let a million tokens expire in March.

That was the prompt for Lobster Agent Trader: stop wasting the allowance you already bought.

It's a self-hosted trading agent on Lighter. Every cycle it takes a market snapshot, asks the model for a structured decision, checks it against hard guardrails, executes what survives — and files a record of everything, including what it refused to do.

The guardrails clamp rather than scale. $250 max. Ask for $1000, you get $250.

Live trading needs three independent unlocks. That's deliberate friction, and it exists because the failure mode is your money on someone else's server.

Self-hosted. Your exchange key never touches the database.

147 tests, including one for a model that literally asked for an `ioc` order with no limit price.

https://github.com/projectlobster/Lobster-Agent-Trader

---

## Notes on what I deliberately left out

- **No profit or return claims.** The paper-mode section exists precisely because the numbers in the console are sample data, and saying so up front costs nothing.
- **No "risk-free" / "guaranteed" / "proven".** Nothing in the codebase supports those words.
- **No urgency language** — "waitlist", "limited spots", "DM me". It's a self-hosted open-source tool; scarcity framing would be a lie.
- **The `ioc` detail** is in because it's a concrete, verifiable fact that says more about the guardrails' purpose than any adjective would.
