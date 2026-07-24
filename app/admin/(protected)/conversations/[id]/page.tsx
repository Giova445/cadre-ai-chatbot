import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { conversationRepo } from "@/lib/admin/repos";
import { flagRepo } from "@/lib/admin/flag-repo";
import { TranscriptTurn } from "../../../_components/TranscriptTurn";
import { RetrievalTracePanel } from "../../../_components/RetrievalTracePanel";
import { ModeBadge } from "../../../_components/ModeBadge";
import { FlagBadge } from "../../../_components/FlagBadge";
import { FlagForm } from "../../../_components/FlagForm";
import { Reveal } from "../../../_components/Reveal";
import { BackIcon, CrumbIcon } from "../../../_components/Icons";
import styles from "../../../admin.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ client?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  // The active client scopes the fetch: a crafted id from another tenant returns
  // null → notFound, so the URL can't cross tenants. Empty string → unscoped.
  const client = sp.client || undefined;

  const detail = await conversationRepo.getDetail(id, { clientId: client });
  if (!detail) {
    notFound();
  }

  const { conversation, messages, traces } = detail;
  const clientQs = client ? `?client=${encodeURIComponent(client)}` : "";
  const sessionParams = new URLSearchParams({ session: conversation.sessionId });
  if (client) sessionParams.set("client", client);
  const sessionHref = `/admin/conversations?${sessionParams.toString()}`;

  // Flags are keyed by assistant message id — forMessages([]) is skipped so
  // the repo never has to special-case an empty id list.
  const assistantMessageIds = messages.filter((m) => m.role === "assistant").map((m) => m.id);
  const flagsByMessage =
    assistantMessageIds.length > 0 ? await flagRepo.forMessages(assistantMessageIds) : {};

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Conversation breadcrumb">
        <Link href={`/admin/conversations${clientQs}`} className={styles.backLink}>
          <BackIcon size={12} />
          <span>Conversations</span>
        </Link>
        <span className={styles.breadcrumbSep} aria-hidden>
          <CrumbIcon size={10} />
        </span>
        <span className={styles.breadcrumbCurrent}>
          <code>{conversation.sessionId}</code>
        </span>
      </nav>

      <div className={styles.detailHead}>
        <span className={styles.overline}>Conversation</span>
        <h1 className={styles.pageTitleDetail}>{conversation.sessionId}</h1>
      </div>

      <div className={styles.splitLayout}>
        <aside className={styles.splitRail} aria-label="Conversation metadata">
          <dl className={styles.detailMeta}>
            <div>
              <dt>Started</dt>
              <dd>{DATE_FORMAT.format(new Date(conversation.startedAt))}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>
                <Link href={sessionHref} className={styles.cellLink}>
                  <code>{conversation.sessionId}</code>
                </Link>
              </dd>
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
        </aside>

        <div className={styles.splitMain}>
          <div
            className={styles.transcript}
            role="log"
            aria-label="Conversation transcript"
          >
            {messages.map((message, index) => {
              const isAssistant = message.role === "assistant";
              const trace = isAssistant ? traces[message.id] : undefined;
              const flags = isAssistant ? flagsByMessage[message.id] ?? [] : [];
              return (
                <Reveal key={message.id} index={index} as="div" className={styles.transcriptItem}>
                  <TranscriptTurn message={message} />
                  {trace && <RetrievalTracePanel trace={trace} />}
                  {isAssistant && (
                    <div className={styles.flagArea}>
                      {flags.length > 0 && (
                        <div className={styles.flagList} aria-label="Flags on this answer">
                          {flags.map((flag) => (
                            <FlagBadge key={flag.id} flag={flag} />
                          ))}
                        </div>
                      )}
                      <FlagForm messageId={message.id} />
                    </div>
                  )}
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
