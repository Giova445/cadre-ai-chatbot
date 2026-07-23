import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { BoxMark, Wordmark } from "../../logo";
import { LogoutButton } from "../_components/LogoutButton";
import styles from "../admin.module.css";

export const metadata: Metadata = {
  title: "Cadre AI — Admin",
  robots: { index: false, follow: false },
};

// Server-side gate for the authenticated admin subtree (conversations list +
// detail). Deliberately scoped to a (protected) route group — NOT a flat
// app/admin/layout.tsx — because app/admin/login/page.tsx is also a child of
// app/admin/ and must NOT inherit this gate: requireAdmin() unconditionally
// redirects to /admin/login on no session, so wrapping the login route in the
// same gate would infinite-loop. Route groups don't affect the URL: this
// still serves /admin, /admin/conversations, /admin/conversations/[id].
export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <BoxMark className={styles.brandMark} />
            <Wordmark className={styles.wordmark} />
            <span className={styles.brandLabel}>Admin</span>
          </div>
          <nav className={styles.nav} aria-label="Admin navigation">
            <Link href="/admin/conversations" className={styles.navLink}>
              Conversations
            </Link>
            <Link href="/admin/queue" className={styles.navLink}>
              Queue
            </Link>
            <Link href="/admin/gaps" className={styles.navLink}>
              Gaps
            </Link>
            <LogoutButton />
          </nav>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
