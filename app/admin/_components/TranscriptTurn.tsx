import type { MessageRow } from "@/lib/admin/contracts";
import styles from "../admin.module.css";

// Read-only chat bubble for the admin transcript view. Deliberately plainer
// than the public chat bubble (no markdown rendering, no avatar) — this is a
// log viewer, not a live conversation.
export function TranscriptTurn({ message }: { message: MessageRow }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`${styles.turnRow} ${isUser ? styles.turnRowUser : styles.turnRowAssistant}`}
    >
      <span className={styles.turnRole}>{isUser ? "User" : "Assistant"}</span>
      <div className={`${styles.turn} ${isUser ? styles.turnUser : styles.turnAssistant}`}>
        {message.content}
      </div>
    </div>
  );
}
