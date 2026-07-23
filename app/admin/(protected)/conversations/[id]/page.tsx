import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { conversationRepo } from "@/lib/admin/repos";
import { TranscriptTurn } from "../../../_components/TranscriptTurn";
import { RetrievalTracePanel } from "../../../_components/RetrievalTracePanel";
import { ModeBadge } from "../../../_components/ModeBadge";
import styles from "../../../admin.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const detail = await conversationRepo.getDetail(id);
  if (!detail) {
    notFound();
  }

  const { conversation, messages, traces } = detail;

  return (
    <div className={styles.page}>
      <Link href="/admin/conversations" className={styles.backLink}>
        ← All conversations
      </Link>

      <div className={styles.detailHead}>
        <h1 className={styles.pageTitle}>Conversation</h1>
        <dl className={styles.detailMeta}>
          <div>
            <dt>Started</dt>
            <dd>{DATE_FORMAT.format(new Date(conversation.startedAt))}</dd>
          </div>
          <div>
            <dt>Turns</dt>
            <dd>{conversation.messageCount}</dd>
          </div>
          <div>
            <dt>Last mode</dt>
            <dd>
              <ModeBadge mode={conversation.lastMode} />
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.transcript} role="log" aria-label="Conversation transcript">
        {messages.map((message) => {
          const trace = message.role === "assistant" ? traces[message.id] : undefined;
          return (
            <div key={message.id} className={styles.transcriptItem}>
              <TranscriptTurn message={message} />
              {trace && <RetrievalTracePanel trace={trace} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
