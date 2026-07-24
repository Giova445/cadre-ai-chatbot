import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin/auth";
import { clientRepo } from "@/lib/admin/client-repo";
import { listRegisteredClients, DEFAULT_CLIENT_ID } from "@/lib/clients";
import type { ClientSummary } from "@/lib/admin/contracts";
import { ClientSelector } from "../../_components/ClientSelector";
import { EmbedPanel } from "../../_components/EmbedPanel";
import styles from "../../admin.module.css";

export const metadata: Metadata = {
  title: "Cadre AI — Embed",
  robots: { index: false, follow: false },
};

// The client dropdown must offer server-known ids, never free text (Admin
// § A6) — otherwise an operator can generate a snippet for a `client`
// `resolveClient` will fail-closed to "default", silently mis-attributing
// that tenant's traffic. Union of the registry (configured, maybe not yet
// live) and clientRepo.listClients() (has logged traffic) — a just-onboarded
// tenant is selectable immediately even before its first conversation.
function mergeClientOptions(
  registered: { id: string }[],
  traffic: ClientSummary[],
): ClientSummary[] {
  const byId = new Map<string, ClientSummary>();
  for (const c of traffic) byId.set(c.id, c);
  for (const r of registered) {
    if (!byId.has(r.id)) {
      byId.set(r.id, { id: r.id, conversationCount: 0, lastActivityAt: null });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  let traffic: ClientSummary[] = [];
  try {
    traffic = await clientRepo.listClients();
  } catch {
    // DB unconfigured/unreachable — the registry-only list still renders.
    traffic = [];
  }
  const registered = listRegisteredClients();
  const options = mergeClientOptions(registered, traffic);

  const requestedClient = sp.client?.trim();
  const client =
    requestedClient && options.some((o) => o.id === requestedClient)
      ? requestedClient
      : requestedClient || DEFAULT_CLIENT_ID;

  // Our own deploy origin (never the host page's) — the snippet's script `src`
  // and the preview iframe both point here.
  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const apiBase = host ? `${proto}://${host}` : "";

  return (
    <div className={styles.page}>
      {options.length > 0 && (
        <div className={styles.clientSwitch} aria-label="Choose client">
          <ClientSelector clients={options} />
        </div>
      )}
      <EmbedPanel client={client} apiBase={apiBase} />
    </div>
  );
}
