import type { ComponentProps } from "react";

// Thin re-export of the Phosphor icons the admin actually uses. One place to
// tune the size + weight policy. Phosphor weights: "thin" | "light" | "regular"
// | "bold" | "fill" | "duotone". We use "regular" with weight inheritance so
// icons sit at the same visual weight as the body text.
//
// Importing from the dist/ssr entry because @phosphor-icons/react is a large
// library and the tree-shakeable '/ssr' import keeps the RSC bundles small.

import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  CheckCircle,
  ChatCircleDots,
  Question,
  ListChecks,
  HourglassMedium,
  Sparkle,
  MagnifyingGlass,
  ChartBar,
  FileCode,
  TreeStructure,
  SignOut,
  Warning,
  ShieldWarning,
  EnvelopeSimple,
  CalendarPlus,
  CaretLeft,
  Archive,
  Play,
} from "@phosphor-icons/react/dist/ssr";

export type IconProps = ComponentProps<typeof ArrowRight> & {
  size?: number;
};

const base = {
  weight: "regular" as const,
  "aria-hidden": true,
  focusable: false,
};

/** Tinted arrow helper for "back to list" links (← ArrowLeft). */
export function BackIcon({ size = 14, ...rest }: IconProps) {
  return <ArrowLeft size={size} {...base} {...rest} />;
}
export function ForwardIcon({ size = 14, ...rest }: IconProps) {
  return <ArrowRight size={size} {...base} {...rest} />;
}

export function RefreshIcon({ size = 14, ...rest }: IconProps) {
  return <ArrowClockwise size={size} {...base} {...rest} />;
}

/** "Process now" glyph for the manual crawl-drain button. */
export function PlayIcon({ size = 14, ...rest }: IconProps) {
  return <Play size={size} {...base} {...rest} />;
}

/** Logout button glyph — SignOut (door, not the cliché power icon). */
export function LogoutIcon({ size = 14, ...rest }: IconProps) {
  return <SignOut size={size} {...base} {...rest} />;
}

/** Breadcrumb separator (subtle). */
export function CrumbIcon({ size = 10, ...rest }: IconProps) {
  return <CaretLeft size={size} {...base} {...rest} />;
}

// ---- nav icons -------------------------------------------------------------
export const NavIcon = {
  Conversations: ChatCircleDots,
  Questions: Question,
  Queue: HourglassMedium,
  Gaps: Sparkle,
  Usage: ChartBar,
  Embed: FileCode,
  Sitemap: TreeStructure,
} as const;

// ---- empty-state marks -----------------------------------------------------
export const EmptyIcon = {
  Conversations: ChatCircleDots,
  Questions: Question,
  Queue: HourglassMedium,
  Gaps: Sparkle,
  Flags: Warning,
  Inbox: Archive,
} as const;

export function IconWrapper({
  children,
  className,
  /** svg is ~18px; the chip sits 36px to read as a composition (overline-mark). */
  length = 36,
}: {
  children: React.ReactNode;
  className?: string;
  length?: number;
}) {
  return (
    <span className={className} style={{ width: length, height: length, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </span>
  );
}

export { base as IconBaseProps };
