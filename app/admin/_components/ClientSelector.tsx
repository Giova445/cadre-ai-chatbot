"use client";

import type { ChangeEvent } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ClientSummary } from "@/lib/admin/contracts";
import styles from "../admin.module.css";

// Header tenant selector. A small client island (the rest of the admin chrome
// stays a Server Component): it reads the active `?client` from the URL and, on
// change, scopes the whole dashboard by rewriting that param. Switching tenant
// resets page/mode/session filters (counts and ids differ per tenant) and, from
// a conversation-detail URL, returns to the list — a crafted id would otherwise
// resolve to notFound under the newly-scoped getDetail.
//
// The empty-string option is "All clients" — no `?client` param, an unscoped
// read across every tenant (distinct from the "default" tenant).
export function ClientSelector({ clients }: { clients: ClientSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("client") ?? "";

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    const base = pathname.startsWith("/admin/conversations/")
      ? "/admin/conversations"
      : pathname;
    router.push(value ? `${base}?client=${encodeURIComponent(value)}` : base);
  }

  return (
    <label className={styles.clientSelect}>
      <span className="sr-only">Filter by client</span>
      <select value={current} onChange={onChange} aria-label="Filter by client">
        <option value="">All clients</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.id} ({client.conversationCount})
          </option>
        ))}
      </select>
    </label>
  );
}
