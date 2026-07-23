import type { BalanceInfo } from "@/lib/usage/types";
import { formatUsd } from "@/lib/admin/format-usd";
import styles from "../admin.module.css";

// Provider balance card for the Usage & Cost panel. OpenRouter exposes a real
// remaining-credit balance (`/credits`); OpenAI has no such endpoint, so
// `balanceAvailable` is false and the backend supplies a human-readable `note`
// explaining the gap — rendered verbatim rather than guessed at, alongside the
// spend-to-date figure we DO always have (computed from usage_events).
export function BalanceCard({ balance }: { balance: BalanceInfo }) {
  return (
    <section className={styles.balanceCard} aria-label="Provider balance">
      <h2 className={styles.usageSectionTitle}>Balance</h2>
      <dl className={styles.balanceCardBody}>
        <div>
          <dt>Provider</dt>
          <dd>{balance.provider}</dd>
        </div>
        {balance.balanceAvailable ? (
          <div>
            <dt>Remaining</dt>
            <dd className={styles.balanceCardValue}>
              {balance.remainingUsd == null ? "—" : formatUsd(balance.remainingUsd)}
            </dd>
          </div>
        ) : (
          <div>
            <dt>Remaining</dt>
            <dd className={styles.balanceCardNote}>{balance.note}</dd>
          </div>
        )}
        <div>
          <dt>Spend to date</dt>
          <dd className={styles.balanceCardValue}>{formatUsd(balance.spendToDateUsd)}</dd>
        </div>
      </dl>
    </section>
  );
}
