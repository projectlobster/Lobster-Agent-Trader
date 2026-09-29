import Link from "next/link";
import { Brand } from "@/components/ui/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const columns = [
  {
    title: "Console",
    items: [
      { label: "Dashboard", href: "/console" },
      { label: "Runs", href: "/console/runs" },
      { label: "Agent", href: "/console/agent" },
      { label: "Settings", href: "/console/settings" },
    ],
  },
  {
    title: "Data",
    items: [
      { label: "Token ledger", href: "/console" },
      { label: "Positions", href: "/console" },
      { label: "Equity", href: "/console" },
      { label: "Orders", href: "/console/runs" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "Lighter", href: "https://lighter.xyz" },
      { label: "Agent Kit", href: "https://github.com/elliottech/lighter-agent-kit" },
      { label: "API keys", href: "https://app.lighter.xyz/apikeys" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-canvas">
      <div className="page-measure pt-12 pb-9 md:pt-16">
        <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
          <div className="flex max-w-[22rem] flex-col items-start gap-5">
            <Link href="/" aria-label="Lobster Agent Trader home" className="text-ink">
              <Brand />
            </Link>
            <p className="text-body-sm text-ink-muted">
              Give the AI token allowance you never spend to a trading agent that keeps books and
              explains itself.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-9 sm:grid-cols-3 md:gap-x-16">
            {columns.map((col) => (
              <div key={col.title} className="flex w-[150px] max-w-full flex-col gap-3">
                <p className="font-mono text-label-sm uppercase text-ink-muted">{col.title}</p>
                <ul className="mt-[3px] flex flex-col gap-3">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      {item.href.startsWith("http") ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-body-sm text-ink transition-colors hover:text-accent"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className="text-body-sm text-ink transition-colors hover:text-accent"
                        >
                          {item.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-4 text-body-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            Experimental software · live orders and withdrawals cannot be reversed · prove a
            strategy on testnet before going anywhere near mainnet
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-2 text-ink">
              <span aria-hidden className="size-[7px] rounded-full bg-positive" />
              Local-first · credentials never persisted
            </span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
