---
format: 1080x1080
duration: 30s
message: "You already pay for AI tokens that quietly expire — this spends them, under hard limits, on Lighter"
arc: Hook → Problem → Solution → Evidence → Proof → Close
audience: developers paying for an AI token subscription they never exhaust
mode: collaborative
music: understated electronic, confident rather than energetic
captions: on
---

## Frame 1 — Hook

- scene: A token counter falls from 1,000,000 to zero and keeps going negative; the word "unused" lands
- duration: 4.267s
- poster: 3s
- transition_in: cut
- status: animated
- voiceover: "Every month, you pay for a million tokens and quietly use a fraction of them."
- src: compositions/frames/01-hook.html

Open cold on the waste. No product name yet — the number is the hook, and it should feel
like something the viewer recognises from their own billing page. Hold on zero long enough
that it stings, then let "unused" sit there in the mint tint.

## Frame 2 — The problem

- scene: The same counter, dimmed, with a small "rolls over? no. cashes out? no." annotation
- duration: 4.331s
- transition_in: crossfade
- status: animated
- voiceover: "The rest does not roll over, does not cash out, and never warns you on the way out."
- src: compositions/frames/02-problem.html

Name the three non-features plainly. This is the beat that earns the product: the viewer has
felt this but never articulated it. Keep the type quiet — the point is recognition, not drama.

## Frame 3 — What it is

- scene: The one-line loop draws itself, left to right, with each stage lighting as it lands
- duration: 5.44s
- transition_in: wipe
- status: animated
- voiceover: "Lobster Agent Trader gives that remainder a ledger and a ceiling, and runs a disciplined loop on it."
- src: compositions/frames/03-what.html

The product reveal. Name it, then show the loop as five plain words: allowance, snapshot,
decision, guardrails, order. No jargon, no architecture diagram. Mint marks the one stage
that matters — the guardrails.

## Frame 4 — Evidence: the dashboard

- scene: The real dashboard capture pushes in; the six metric tiles stagger up in sequence
- duration: 4.8s
- transition_in: crossfade
- status: animated
- voiceover: "Here is the allowance, what has been spent, and the P&L it produced — all on one screen."
- src: compositions/frames/04-dashboard.html
- asset_candidates:
  - capture/assets/dashboard-strip.png

First real interface. This is the shot that proves the product exists and is not a mockup.
Push in on the metric strip rather than showing the whole page — six numbers landing in
sequence reads as "this is live data", a static full page does not.

## Frame 5 — Evidence: the audit trail

- scene: The runs table scrolls; rows resolve into ok, blocked, and error states one at a time
- duration: 3.755s
- transition_in: crossfade
- status: animated
- voiceover: "Every decision leaves a record — including the ones the guardrails stopped."
- src: compositions/frames/05-runs.html
- asset_candidates:
  - capture/assets/runs-table.png
  - capture/assets/outcomes-strip.png

The trust beat. A product that trades money has to show its failures as readily as its wins —
the blocked and error rows are the point, not a wart. Let a blocked row sit long enough to
be read.

## Frame 6 — Proof: the locks

- scene: Dark canvas; the three live locks stack up, each clicking from locked to unlocked except the last
- duration: 5.099s
- transition_in: crossfade
- status: animated
- voiceover: "Live trading needs three independent unlocks, and the guardrails clamp rather than scale up."
- src: compositions/frames/06-locks.html

Shift to the dark theme here — it is the only beat that does, which makes it read as the
serious one. The three locks stay locked: that is the message. A "clamp, never scale" callout
carries the guardrail point without a table.

## Frame 7 — Close

- scene: Brand mark and wordmark resolve; repository address types in beneath
- duration: 2.603s
- transition_in: crossfade
- status: animated
- voiceover: "Self-hosted. Bring your own keys. On GitHub."
- src: compositions/frames/07-close.html
- asset_candidates:
  - capture/assets/svgs/logo-fd328552.svg

Land it plainly. No return claims, no profit promise — just where it is and what it asks of
you. The wordmark should feel like the product's own site, not a separate motion brand.

## Video direction

**Canvas** 1080x1080, square. The video must feel like the product's own marketing site,
not a separate motion brand: same canvas (`#F2F0F3`), same near-black ink (`#12101C`), the
mint tint (`#7FF0E2`) as the single accent, Space Grotesk throughout, square corners,
hairline rules, no shadows, no rounded cards. The mark is geometric and angular — the layout
should match it rather than soften it.

**Colour discipline.** Mint marks exactly one thing per frame: the number that matters, the
active stage, the cancelled capability. Everything else is ink on canvas. The one deliberate
exception is Frame 6, which inverts to the dark canvas (`#0E0B1A`) — the only dark beat in
the piece, which is what makes it read as the serious one.

**Type.** Space Grotesk throughout. Numbers carry the weight: large, tight, negative-tracked.
Labels are small, uppercase, monospaced, muted — the chrome vocabulary the product already
uses. Left-align on a single axis so the eye has somewhere to land.

**Camera.** Static by default. The only push-in is Frame 4, because that shot is the evidence
and should feel like you moved closer to something real. No parallax, no 3D.

**Pacing.** Each frame develops across its own duration rather than snapping in and freezing.
The hook's counter runs the full 4s; the dashboard pushes in across 5s; the runs table keeps
drifting so new rows keep arriving. Front-loading a frame and holding it static for three
seconds reads as a slideshow.

**Captions** sit in the lower band per `.hyperframes/caption-skin.html`.

#### Frame 1 · Hook (4.3s)

**Layout.** Centred stack on canvas. A 1,000,000 counter at roughly 200px, ink, tight
tracking, occupying the upper third. Below it the word `unused` in mint at 64px. Beneath
that one muted small-caps monospace line: `does not roll over · does not cash out`.
Generous space above and below — the emptiness is what makes the number land.

**Motion.** The counter runs 1,000,000 → 0 across the full 4s using
`counting-dynamic-scale`: digits hold a static font size and only transform scale changes,
so there is no per-frame text reflow. Scale lands at 1.0 as the value hits 0, so the
emphasis is the number reaching zero, not the number growing. `unused` fades up 0.4s after
the counter settles, then holds dead still for the final 1.2s.

#### Frame 2 · The problem (4.3s)

**Layout.** Same axis as Frame 1, one step dimmer. The counter stays at 0 in `--ink-muted`
at 40% opacity. Three short lines stack beneath, left-aligned, each with a thin mint
strike-through appearing as it lands: `rolls over` / `cashes out` / `warns you`. The strikes
are the argument — each capability visibly cancelled.

**Motion.** Three `discrete-text-sequence` steps at 0.8s each: line appears, holds 0.5s,
strike draws left-to-right. Camera static. On the last strike the whole stack dims 20% — the
beat ends on a downbeat.

#### Frame 3 · What it is (5.4s)

**Layout.** Product name as the H1, left-aligned, 56px, entering top-left. Beneath it one
horizontal chain of five stages on a single baseline with `→` separators: `allowance →
snapshot → decision → guardrails → order`. Equal spacing, no boxes, no cards.
`guardrails` is the only stage in mint — the one word that matters.

**Motion.** The name fades up first (0.5s), then the five stages reveal left to right at
0.55s intervals via `dynamic-content-sequencing`, each fading up 12px as it lands. Mint
arrives on `guardrails` and holds. Final 1.2s: the chain holds static. The point is that
this is one loop, not five features.

#### Frame 4 · Evidence: the dashboard (4.8s)

**Layout.** The real `capture/assets/dashboard-strip.png` plate — the console's own metric
strip, six tiles: tradable allowance, spent, utilisation, equity, total P&L, P&L per 1M
tokens. It is a genuine capture; do not redraw it. It sits centred in the middle band at
full width with a hairline border, and a small mint rule beneath anchors it to the caption
band. Left as-is at 1920 wide it scales to 1080 without reflow, so nothing is cropped.

**Motion.** Slow push-in from 1.0 to 1.06 scale across the full 5s — the only camera move
in the piece, because this shot is the evidence. The six tiles are not animated
individually: the plate is a real screenshot, and treating it as one object is more honest
than faking a staggered reveal on pixels that were captured together. Hold at 1.06 for the
final 0.8s so the frame resolves rather than drifting out.

#### Frame 5 · Evidence: the audit trail (3.8s)

**Layout.** Two real plates stacked with a 24px gap: `capture/assets/runs-table.png` on
top, `capture/assets/outcomes-strip.png` beneath. The top plate is the decision table with
its `ok` / `error` status column; the bottom is the `DECISION OUTCOMES` counter reading
`BLOCKED 3 · ERROR 4 · OK 19 · SKIPPED 2`. Together they say more than either alone: the
table shows the rows, the counter shows that failures are counted, not hidden.

**Motion.** A slow vertical drift of 40px over the full 5s, enough that new rows keep
arriving at the bottom. No per-row animation: the point is that these rows are a record,
and a record should look still. A mint hairline draws left-to-right under the `BLOCKED 3`
figure and holds — that number is the argument.

#### Frame 6 · Proof: the locks (5.1s)

**Layout.** Inverted: canvas becomes `#0E0B1A`, ink becomes `#F2F0F3`. Three lock rows
stack centre-left, each a mint-outlined square containing a lock glyph beside its
requirement in muted caps. All three stay closed. A fourth line beneath in mint reads
`clamp, never scale up`.

**Motion.** The three rows arrive 0.5s apart with a 12px rise, `dynamic-content-sequencing`.
None of them open — the absence of the unlock animation is the point. The `clamp, never
scale up` line fades up last and holds the final 1.5s. No glow, no pulse: this is the most
restrained beat in the piece and should feel that way.

#### Frame 7 · Close (2.6s)

**Layout.** The exported brand mark centred at 96px above the wordmark `Lobster Agent
Trader` at 44px, both ink on canvas. Repository address
`github.com/projectlobster/Lobster-Agent-Trader` beneath at 20px monospace, muted. Mark and
wordmark are the real exported assets, not a redrawing.

**Motion.** Per `logo-assemble-lockup` (Brand_Outro shape, static camera): the mark
spring-blooms from zero at dead centre over 0.5s, the wordmark cascades in beside it over
the next 0.4s, then the address types on. Hold the completed lockup for the final 1s with
nothing moving at all.
