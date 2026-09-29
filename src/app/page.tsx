import Link from "next/link";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopyCommand } from "@/components/ui/CopyCommand";
import { Corner } from "@/components/ui/Corner";
import { Label } from "@/components/ui/Label";
import { Panel } from "@/components/ui/Panel";

const ways = [
  {
    tag: "Setup",
    title: "Adopt the Lighter Agent Kit",
    body: "Market data, order signing and paper fills all come from the official lighter-agent-kit. This project only does decisions, accounting and risk — it never re-implements signing or tick maths.",
    footer: <CopyCommand command="npm run setup" />,
  },
  {
    tag: "Ledger",
    title: "Make \"unused\" measurable",
    body: "Your monthly token budget minus the part reserved for normal work is what the trader may spend. Every token is recorded, and when the allowance runs out the engine stops by itself.",
    footer: (
      <div className="w-full pt-[22px]">
        <p className="font-mono text-label-sm text-ink-muted">
          budget − reserved = tradable allowance
        </p>
      </div>
    ),
  },
  {
    tag: "Agent",
    title: "Let the loop run itself",
    body: "Each interval it pulls a snapshot, asks the model for a structured decision, runs the guardrails, then executes. Blocked decisions are archived too — nothing disappears silently.",
    footer: (
      <Link
        href="/console"
        className="mt-auto inline-flex pt-[22px] font-mono text-label-sm font-bold text-accent uppercase hover:underline hover:underline-offset-4"
      >
        Open the console
      </Link>
    ),
  },
];

const gates = [
  { symbol: "BTC", note: "Anything off the allow-list is refused", value: "3 symbols" },
  { symbol: "ETH", note: "Oversized orders are clamped, never scaled up", value: "$250 / order" },
  { symbol: "SOL", note: "Leverage, position count and daily loss, all capped", value: "≤3x" },
  { symbol: "RUN", note: "A blocked decision becomes a visible blocked run", value: "48 / day" },
];

const faqs = [
  {
    q: "What exactly counts as \"unused AI tokens\"?",
    a: "The slice of your monthly model budget you will not spend on ordinary work. This project turns that remainder into an explicit allowance, lets the agent spend only that, and stops the moment it is gone.",
  },
  {
    q: "Does it place real orders?",
    a: "Not by default. It ships in paper mode: a local simulation against Lighter's live order books, with no signing and no broadcast. Going live takes three things at once — LIGHTER_ENABLE_LIVE=1 on the server, the switch in Settings, and typing a confirmation in the console.",
  },
  {
    q: "Can I trust the paper P&L?",
    a: "No. Paper fills are taker-only, and the simulator models neither order impact, nor latency, nor partial fills. It also ignores funding, which for a position held overnight is usually the single largest driver of P&L. The console says so wherever it shows paper numbers.",
  },
  {
    q: "Can the model place whatever it likes?",
    a: "It can only emit a structured JSON decision — it never touches a command line. Order parameters are computed locally from live market metadata and the guardrails. Notional, leverage, position count, cooldown and daily loss all have hard caps, and hitting one stops the engine.",
  },
  {
    q: "Do I have to hand over a private key?",
    a: "No. It reuses the kit's credential model: the Lighter API key stays on the machine and never passes through the browser, the logs or the database. A model API key can live in .env.local or in the local database, and the API only ever reports whether one is set.",
  },
  {
    q: "Who eats the losses?",
    a: "You do. This is experimental software and live orders and withdrawals cannot be reversed. Prove a strategy on testnet first, then trade only what you can afford to lose.",
  },
];

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <section className="relative flex min-h-[42rem] flex-col overflow-hidden md:min-h-[44rem]">
          <div className="relative z-10 page-measure flex flex-col items-center pt-12 text-center md:pt-16">
            <Label>Lobster Agent Trader</Label>
            <h1 className="mt-5 max-w-[18ch] text-hero text-balance text-ink">
              Turn the AI tokens you never spend into
              <mark className="bg-tint-cyan px-2 text-tint-fg [box-decoration-break:clone]">
                positions that actually run.
              </mark>
            </h1>
            <p className="mt-6 max-w-[34rem] text-lede-lg leading-[1.55] text-balance text-ink-muted">
              An allowance ledger, structured decisions and hard guardrails — one loop that puts an
              idle monthly budget to work on Lighter.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/console" size="lg">
                Open the console
              </ButtonLink>
              <ButtonLink href="/console/settings" variant="secondary" size="lg">
                Configure the allowance
              </ButtonLink>
            </div>
          </div>

          <div className="relative mt-16 md:mt-20">
            <Panel className="mx-auto max-w-[64rem]" corners hover>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-panel-fg-label/30 px-6 py-4">
                <span className="font-mono text-label-sm uppercase text-tint-cyan">
                  agent cycle
                </span>
                <span className="font-mono text-mono-xs text-panel-fg-muted">
                  snapshot → decision → guardrails → order → ledger
                </span>
              </div>
              <ol className="grid gap-px bg-panel-fg-label/25 md:grid-cols-3">
                {[
                  {
                    index: "01",
                    title: "Market snapshot",
                    items: [
                      "Order book and depth",
                      "15m candle series",
                      "Funding rates",
                      "Tick size and minimums",
                    ],
                  },
                  {
                    index: "02",
                    title: "Structured decision",
                    items: [
                      "action / side / size",
                      "Self-reported confidence",
                      "Thesis and invalidation",
                      "Never free-form CLI args",
                    ],
                  },
                  {
                    index: "03",
                    title: "Guardrails and ledger",
                    items: [
                      "Allow-list and notional cap",
                      "Leverage and position caps",
                      "Cooldown and daily loss cap",
                      "Token spend recorded",
                    ],
                  },
                ].map((step) => (
                  <li key={step.index} className="flex flex-col items-start bg-panel px-6 py-6">
                    <p className="font-mono text-label-sm uppercase text-panel-fg-muted">
                      <span className="text-tint-cyan">{step.index}</span> {step.title}
                    </p>
                    <ul className="mt-4 flex flex-col gap-1.5">
                      {step.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-2.5 text-card-title text-panel-fg"
                        >
                          <span aria-hidden className="size-[7px] shrink-0 bg-tint-cyan" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        </section>

        <section className="py-14 md:py-22">
          <div className="page-measure flex flex-col gap-11">
            <div className="flex flex-col gap-3.5">
              <h2 className="max-w-[34ch] text-h2 text-balance text-ink">
                Three pieces, and the idle allowance is trading.
              </h2>
              <p className="max-w-[36rem] text-lede text-pretty text-ink-muted">
                An allowance ledger, the official agent kit, and a decision loop with guardrails.
              </p>
            </div>
            <ul className="grid gap-5 md:grid-cols-3">
              {ways.map((way) => (
                <li key={way.tag} className="flex">
                  <Card
                    label={way.tag}
                    title={way.title}
                    footer={way.footer}
                    interactive
                    className="w-full"
                  >
                    <p className="mt-3 max-w-[340px] text-body text-ink-muted">{way.body}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-tint-mint py-14 md:py-22">
          <div className="page-measure flex flex-col">
            <div className="flex flex-col gap-3.5">
              <h2 className="max-w-[34ch] text-h2 text-balance text-tint-fg">
                The model has to clear this first.
              </h2>
              <p className="max-w-[36rem] text-lede text-pretty text-tint-fg/75">
                Guardrails run before an order is built. A decision they stop becomes a blocked run
                you can inspect, rather than something that quietly disappeared.
              </p>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {gates.map((gate) => (
                <li
                  key={gate.symbol}
                  className="group relative isolate flex h-full flex-col items-start overflow-hidden bg-surface p-5 transition-shadow hover:shadow-[0_18px_40px_-24px_rgb(18_16_28/0.35)]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 origin-top scale-y-0 bg-tint-blue transition-transform duration-[240ms] ease-[steps(6,end)] group-hover:scale-y-100 motion-reduce:transition-none"
                  />
                  <span className="font-mono text-label-xs font-bold text-accent uppercase">
                    GATE
                  </span>
                  <span className="mt-4 font-mono text-lede leading-6 font-medium text-ink">
                    {gate.symbol}
                  </span>
                  <span className="mt-0.5 text-body-xs text-ink-subtle">Risk layer</span>
                  <span className="mt-4 text-body-xs text-ink-muted">{gate.note}</span>
                  <span className="tabular mt-auto pt-6 font-mono text-mono-xs text-ink">
                    {gate.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="py-14 md:py-22">
          <div className="page-measure flex flex-col gap-11">
            <div className="flex flex-col gap-3.5">
              <h2 className="max-w-[34ch] text-h2 text-balance text-ink">Start in paper mode.</h2>
              <p className="max-w-[36rem] text-lede text-pretty text-ink-muted">
                The default never touches real money. Going live needs three locks open at once.
              </p>
            </div>
            <ul className="grid gap-5 md:grid-cols-3">
              <li className="flex flex-col bg-surface text-ink">
                <div className="border-b border-line px-7 py-3">
                  <p className="font-mono text-label-sm font-bold uppercase text-accent">Paper</p>
                </div>
                <div className="flex flex-1 flex-col items-start px-7 pt-7 pb-8">
                  <h3 className="text-h2">Default</h3>
                  <p className="mt-4 mb-10 max-w-[330px] text-body text-ink-muted">
                    Local matching against Lighter's live book. No signing, no broadcast, and no
                    credentials required.
                  </p>
                  <ButtonLink href="/console/agent" className="mt-auto" size="sm">
                    Create a paper account
                  </ButtonLink>
                </div>
              </li>
              <li className="flex flex-col bg-panel text-panel-fg">
                <div className="border-b border-panel-fg-label/30 px-7 py-3">
                  <p className="font-mono text-label-sm font-bold uppercase text-tint-mint-strong">
                    Live
                  </p>
                </div>
                <div className="flex flex-1 flex-col items-start px-7 pt-7 pb-8">
                  <h3 className="text-h2">Three locks</h3>
                  <p className="mt-4 mb-10 max-w-[330px] text-body text-panel-fg-muted">
                    A server environment variable, the switch in Settings, and a typed confirmation
                    before the mode changes. Miss one and it will not start.
                  </p>
                  <span className="mt-auto font-mono text-label-sm uppercase text-tint-cyan">
                    LIGHTER_ENABLE_LIVE=1
                  </span>
                </div>
              </li>
              <li className="flex flex-col bg-surface text-ink">
                <div className="border-b border-line px-7 py-3">
                  <p className="font-mono text-label-sm font-bold uppercase text-negative">
                    Emergency
                  </p>
                </div>
                <div className="flex flex-1 flex-col items-start px-7 pt-7 pb-8">
                  <h3 className="text-h2">Stop</h3>
                  <p className="mt-4 mb-10 max-w-[330px] text-body text-ink-muted">
                    Stopping the engine is one click. Flattening everything first previews the
                    positions it would close, then demands an explicit confirmation.
                  </p>
                  <Link
                    href="/console/agent"
                    className="mt-auto font-mono text-label-sm font-bold text-accent uppercase hover:underline hover:underline-offset-4"
                  >
                    Open the controls
                  </Link>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section className="relative overflow-hidden bg-tint-yellow py-14 md:py-22">
          <Corner className="bg-tint-fg" />
          <div className="page-measure relative z-10">
            <h2 className="max-w-[16ch] text-display text-tint-fg">
              Every decision
              <br />
              leaves a record.
            </h2>
            <p className="mt-6 max-w-[400px] text-lede text-tint-fg/80">
              Each run keeps the market snapshot the model was given, its raw reply, the full trace,
              and what the decision cost in tokens.
            </p>
            <dl className="mt-8 grid max-w-[46rem] gap-px bg-tint-fg/20 md:grid-cols-3">
              {[
                { term: "Snapshot", detail: "The exact data the model saw, archived as-is." },
                {
                  term: "Trace and status",
                  detail: "Every step with its timing, kept alongside the run.",
                },
                { term: "Spend and cost", detail: "Tokens and dollars for each decision." },
              ].map((row, index) => (
                <div
                  key={row.term}
                  className={index === 0 ? "bg-tint-yellow p-5 md:pl-0" : "bg-tint-yellow p-5"}
                >
                  <dt className="font-mono text-label-sm uppercase text-tint-fg">{row.term}</dt>
                  <dd className="mt-2 text-body text-tint-fg/75">{row.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="py-14 md:py-22">
          <div className="page-measure grid gap-11 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
            <div className="flex flex-col gap-3.5">
              <h2 className="max-w-[34ch] text-h2 text-balance text-ink">
                Let us be clear about the edges.
              </h2>
              <p className="max-w-[36rem] text-lede text-pretty text-ink-muted">
                An experiment in putting a wasted allowance to work — not a promise of returns.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {faqs.map((faq) => (
                <details key={faq.q} className="group bg-surface px-6 py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-card-title text-ink">
                    {faq.q}
                    <span
                      aria-hidden
                      className="font-mono text-label-sm text-ink-muted transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-[40rem] pb-5 text-body text-ink-muted">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="relative flex min-h-[30rem] flex-col overflow-hidden bg-plate py-14 md:py-22">
          <div className="relative z-10 page-measure flex flex-col items-center text-center">
            <h2 className="max-w-[30ch] text-h2-cta text-balance text-panel-fg">
              <span className="block">Get the allowance right first.</span>
              Then decide whether it should
              <mark className="bg-tint-blue px-2 text-tint-blue-fg [box-decoration-break:clone]">
                trade for real.
              </mark>
            </h2>
            <div className="mt-[30px] flex flex-wrap justify-center gap-3">
              <ButtonLink href="/console" variant="tint" size="lg">
                Open the console
              </ButtonLink>
              <ButtonLink href="/console/settings" variant="secondary" size="lg">
                Configure model and budget
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
