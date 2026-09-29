import Link from "next/link";
import { AreaChart } from "@/components/charts/AreaChart";
import { MetricStrip } from "@/components/console/MetricStrip";
import { PositionsTable } from "@/components/console/PositionsTable";
import { RunsTable } from "@/components/console/RunsTable";
import { Section } from "@/components/console/Section";
import { TokenBudgetBar } from "@/components/console/TokenBudgetBar";
import { LedgerPanel } from "@/components/console/LedgerPanel";
import { ButtonLink } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { listEquity } from "@/lib/store/equity";
import { getOverview } from "@/lib/overview";
import { shortDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConsoleDashboardPage() {
  const overview = await getOverview({ runLimit: 8 });
  const equity = listEquity(300, overview.engine.mode);
  const equityPoints = equity.map((point) => ({
    label: point.taken_at,
    value: point.equity,
  }));
  const initialCollateral = equity[0]?.initial_collateral ?? null;

  return (
    <div className="flex flex-col gap-10 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Dashboard</Label>
          <h1 className="text-h1 text-ink">Turning idle allowance into positions</h1>
          <p className="max-w-[46rem] text-body text-ink-muted">
            Period <span className="font-mono">{overview.ledger.periodKey}</span> · engine{" "}
            {overview.engine.running ? "running" : "stopped"} · mode{" "}
            <span className="font-mono">{overview.engine.mode}</span>
            {overview.engine.lastTickAt
              ? ` · last decision ${shortDateTime(overview.engine.lastTickAt)}`
              : " · no decisions recorded yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/console/agent" variant="secondary" size="sm">
            Agent controls
          </ButtonLink>
          <ButtonLink href="/console/settings" variant="secondary" size="sm">
            Settings
          </ButtonLink>
        </div>
      </div>

      {!overview.kit.installed ? (
        <Notice tone="error" title="lighter-agent-kit is not installed">
          Run <span className="font-mono">npm run setup</span>, or point{" "}
          <span className="font-mono">LIGHTER_AGENT_KIT_DIR</span> at it in Settings. Until then the
          agent cannot read any market data.
        </Notice>
      ) : null}

      {overview.warnings.length > 0 ? (
        <Notice tone="warn" title="Account state is partially unavailable">
          <ul className="flex flex-col gap-1">
            {overview.warnings.map((warning) => (
              <li key={warning} className="font-mono text-mono-xs">
                · {warning}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <MetricStrip ledger={overview.ledger} account={overview.account} mode={overview.engine.mode} />

      <Section
        label="Token ledger"
        title="Where the allowance went"
        description="The monthly budget minus what is reserved for ordinary work is what the trader may spend. That line is the whole premise of the product."
      >
        <TokenBudgetBar ledger={overview.ledger} />
      </Section>

      <Section
        label="Equity"
        title="Equity curve"
        description={
          overview.engine.mode === "paper"
            ? "The paper curve comes from local simulation: taker fills only, no order-impact model, no funding. It diverges from live results systematically."
            : "The live curve is taken from the Lighter account's collateral and unrealised P&L."
        }
      >
        <AreaChart points={equityPoints} baseline={initialCollateral} height={240} />
      </Section>

      <Section
        label="Positions"
        title="Open positions"
        actions={
          <ButtonLink href="/console/agent" variant="secondary" size="sm">
            Manage
          </ButtonLink>
        }
      >
        <PositionsTable positions={overview.positions} mode={overview.engine.mode} />
      </Section>

      <Section
        label="Runs"
        title="Recent decisions"
        actions={
          <Link
            href="/console/runs"
            className="font-mono text-label-sm font-bold text-accent uppercase hover:underline hover:underline-offset-4"
          >
            All decisions
          </Link>
        }
      >
        <RunsTable runs={overview.runs} />
      </Section>

      <Section
        label="Ledger"
        title="Token spend detail"
        description="This is where the unused tokens are actually spent — every decision leaves a row here."
      >
        <LedgerPanel ledger={overview.ledger} />
      </Section>

      <Section label="Orders" title="Recently submitted orders">
        {overview.orders.length === 0 ? (
          <div className="border border-line bg-surface px-4 py-6">
            <p className="text-body text-ink-muted">No orders submitted yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["When", "Engine", "Symbol", "Side", "Type", "Amount", "Notional", "Fill"].map(
                    (head) => (
                      <th
                        key={head}
                        className="px-4 py-2.5 font-mono text-label-sm uppercase text-ink-muted"
                      >
                        {head}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {overview.orders.map((order) => (
                  <tr key={order.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono text-mono-xs whitespace-nowrap text-ink-muted">
                      {shortDateTime(order.created_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-label-sm uppercase text-ink-subtle">
                      {order.engine}
                    </td>
                    <td className="px-4 py-3 font-mono text-body-sm text-ink">{order.symbol}</td>
                    <td className="px-4 py-3 font-mono text-body-sm text-ink-muted">{order.side}</td>
                    <td className="px-4 py-3 font-mono text-mono-xs text-ink-muted">
                      {order.order_type}
                    </td>
                    <td className="tabular px-4 py-3 font-mono text-mono-xs text-ink-muted">
                      {order.amount}
                    </td>
                    <td className="tabular px-4 py-3 font-mono text-mono-xs text-ink-muted">
                      {order.notional_usd === null ? "—" : `$${order.notional_usd.toFixed(2)}`}
                    </td>
                    <td className="tabular px-4 py-3 font-mono text-mono-xs text-ink-subtle">
                      {order.filled_size === null
                        ? "—"
                        : `${order.filled_size} @ ${order.avg_price?.toFixed(2) ?? "—"}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "error" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border p-4 ${
        tone === "error" ? "border-negative/40 bg-negative/5" : "border-line bg-tint-yellow/40"
      }`}
    >
      <Label className={tone === "error" ? "text-negative" : "text-ink-muted"}>{title}</Label>
      <div className="mt-2 text-body-sm text-ink">{children}</div>
    </div>
  );
}
