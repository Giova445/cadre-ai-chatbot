import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getClientsOverview, getUsageReport, getConversationCosts } from "@/lib/usage/report";
import { getBalance } from "@/lib/usage/balance";
import { checkBudget } from "@/lib/usage/budget";
import { nanoToUsd } from "@/lib/usage/cost";
import { usageRepo } from "@/lib/usage/repo";
import { formatUsd } from "@/lib/admin/format-usd";
import { BalanceCard } from "../../_components/BalanceCard";
import { UsageClientsTable } from "../../_components/UsageClientsTable";
import { UsageDayTable } from "../../_components/UsageDayTable";
import { UsageByModelTable } from "../../_components/UsageByModelTable";
import { UsageConversationsTable } from "../../_components/UsageConversationsTable";
import { BudgetEditor } from "../../_components/BudgetEditor";
import { BudgetStatusBadge } from "../../_components/BudgetStatusBadge";
import { ClientSelector } from "../../_components/ClientSelector";
import styles from "../../admin.module.css";

export const metadata: Metadata = {
  title: "Cadre AI — Admin — Usage & Cost",
  robots: { index: false, follow: false },
};

const CONVERSATION_LIMIT = 20;

/** Month-to-date range: first of the current month through today, YYYY-MM-DD. */
function monthToDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const client = sp.client || undefined;
  const { from, to } = monthToDateRange();

  const [balance, clientsOverview, budgets] = await Promise.all([
    getBalance(),
    getClientsOverview(),
    usageRepo.listBudgets(),
  ]);

  const [report, conversationCosts, budgetStatus] = client
    ? await Promise.all([
        getUsageReport({ clientId: client, from, to }),
        getConversationCosts(client, CONVERSATION_LIMIT),
        checkBudget(client),
      ])
    : [null, [], null];

  // Reuse the shared header ClientSelector: it just needs an id + a count to
  // display, so the usage overview's `requests` stands in for
  // `conversationCount` here — same component, same URL (`?client=`) contract
  // as the conversations panel.
  const selectorClients = clientsOverview.map((row) => ({
    id: row.clientId,
    conversationCount: row.requests,
    lastActivityAt: row.lastActivityAt,
  }));

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <span className={styles.overline}>Cost</span>
        <h1 className={styles.pageTitle}>Usage & Cost</h1>
        <p className={styles.pageSub}>
          <span className={styles.countChip}>{from} – {to}</span>
          Month to date
          {client ? ` · client: ${client}` : ""}
        </p>
        {selectorClients.length > 0 && <ClientSelector clients={selectorClients} />}
      </div>

      <div className={styles.usageGrid}>
        <BalanceCard balance={balance} />

        <section className={styles.usageSection} aria-label={`Budget for ${client ?? "default"}`}>
          <div className={styles.usageSectionHead}>
            <h2 className={styles.usageSectionTitle}>Budget</h2>
            {client && budgetStatus ? <BudgetStatusBadge status={budgetStatus.status} /> : null}
          </div>
          {client && report && budgetStatus ? (
            <p className={styles.pageSub}>
              {formatUsd(nanoToUsd(budgetStatus.usedNanoUsd))} of{" "}
              {budgetStatus.ceilingNanoUsd > 0
                ? formatUsd(nanoToUsd(budgetStatus.ceilingNanoUsd))
                : "unlimited"}{" "}
              this month ({budgetStatus.pct.toFixed(1)}%)
              {budgetStatus.status === "over" ? " — over ceiling" : ""}
            </p>
          ) : (
            <p className={styles.pageSub}>
              No client selected — pick one above to see its budget posture.
            </p>
          )}
          <div className={styles.usageGridFull}>
            <BudgetEditor budgets={budgets} defaultClientId={client} />
          </div>
        </section>

        <section
          className={`${styles.usageSection} ${styles.usageGridFull}`}
          aria-label="Clients overview"
        >
          <h2 className={styles.usageSectionTitle}>Clients</h2>
          <UsageClientsTable rows={clientsOverview} budgets={budgets} activeClient={client} />
        </section>
      </div>

      {client && report && budgetStatus && (
        <>
          <section className={styles.usageSection} aria-label="Usage by day">
            <h2 className={styles.usageSectionTitle}>By day</h2>
            <UsageDayTable rows={report.days} />
          </section>

          <section className={styles.usageSection} aria-label="Cost by model">
            <h2 className={styles.usageSectionTitle}>By model</h2>
            <UsageByModelTable rows={report.byModel} />
          </section>

          <section className={styles.usageSection} aria-label="Cost by conversation">
            <h2 className={styles.usageSectionTitle}>By conversation</h2>
            <UsageConversationsTable rows={conversationCosts} />
          </section>
        </>
      )}

      {!client && (
        <p className={styles.pageNote}>
          Select a client above to see its per-day, per-model, and per-conversation breakdown.
        </p>
      )}
    </div>
  );
}
