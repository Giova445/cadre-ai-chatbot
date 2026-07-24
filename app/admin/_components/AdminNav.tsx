"use client";

// Admin navigation — client component so the active link can be derived from
// usePathname(). Pure presentation: the server layout still gates auth and
// renders the brand + selector. Split so the RSC subtree (client selector,
// logout button) stays WASM-free by default.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { NavIcon } from "./Icons";
import { LogoutButton } from "./LogoutButton";
import type { ClientSummary } from "@/lib/admin/contracts";
import { ClientSelector } from "./ClientSelector";
import styles from "../admin.module.css";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; weight?: "regular" | "bold"; "aria-hidden"?: boolean }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/conversations", label: "Conversations", Icon: NavIcon.Conversations },
  { href: "/admin/questions", label: "Questions", Icon: NavIcon.Questions },
  { href: "/admin/queue", label: "Queue", Icon: NavIcon.Queue },
  { href: "/admin/gaps", label: "Gaps", Icon: NavIcon.Gaps },
  { href: "/admin/usage", label: "Usage", Icon: NavIcon.Usage },
  { href: "/admin/embed", label: "Embed", Icon: NavIcon.Embed },
  { href: "/admin/sitemap", label: "Sitemap", Icon: NavIcon.Sitemap },
];

export function AdminNav({
  clients,
  showSelector,
}: {
  clients: ClientSummary[];
  showSelector: boolean;
}) {
  const pathname = usePathname() ?? "";

  // Active = exact segment match (/admin/queue active on /admin/queue/<id>).
  // Conversation detail pages should mark "Conversations" active.
  function isActive(href: string): boolean {
    if (pathname === href) return true;
    // /admin/foo (no trailing slash) and sub-paths match
    if (pathname.startsWith(href + "/")) return true;
    return false;
  }

  return (
    <nav className={styles.nav} aria-label="Admin navigation">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={14} weight={active ? "bold" : "regular"} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
      {showSelector && <ClientSelector clients={clients} />}
      <LogoutButton />
    </nav>
  );
}
