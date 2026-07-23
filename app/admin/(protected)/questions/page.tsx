import { requireAdmin } from "@/lib/admin/auth";
import { starterRepo } from "@/lib/admin/starter-repo";
import { StarterEditor } from "../../_components/StarterEditor";
import styles from "../../admin.module.css";

// Maker starter-questions editor (Rollout § C, § 4.4). Server component: the
// (protected) layout already gates the subtree, but requireAdmin() runs here too
// (defense-in-depth — the RSC is the real boundary, not middleware). The tenant
// is chosen by ?client (bounded, defaults to "default"); all CRUD flows through
// the StarterEditor client component → starter-actions Server Actions.

const CLIENT_MAX_LEN = 64;

function resolveClient(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.length > CLIENT_MAX_LEN) return "default";
  return trimmed;
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const client = resolveClient(sp.client);

  const starters = await starterRepo.list(client);

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Starter questions</h1>
        <p className={styles.pageSub}>
          {starters.length} {starters.length === 1 ? "chip" : "chips"} · client{" "}
          <code>{client}</code>
        </p>
      </div>

      <p className={styles.pageNote}>
        The suggested-prompt chips shown when the chat first opens. The widget fetches
        the enabled ones from <code>/api/widget-config</code>; a client with none falls
        back to the built-in defaults. Snippet-configured starters
        (<code>data-starters</code>) always win over these.
      </p>

      <form method="get" className={styles.clientSwitch} aria-label="Choose client">
        <label className={styles.flagFormField}>
          <span className={styles.flagFormLabel}>Client</span>
          <input
            className={styles.starterInput}
            name="client"
            defaultValue={client}
            placeholder="default"
            maxLength={CLIENT_MAX_LEN}
          />
        </label>
        <button type="submit" className={styles.starterGhostBtn}>
          Switch
        </button>
      </form>

      <StarterEditor clientId={client} starters={starters} />
    </div>
  );
}
