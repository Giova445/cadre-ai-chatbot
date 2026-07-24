import type { ComponentType, ReactNode } from "react";
import type { IconProps } from "./Icons";
import styles from "../admin.module.css";

// Composed empty-state primitive — replaces the bare "No X yet." text.
// Per the redesign-skill: a mark (overline-sized, 36px chip), a heading,
// a short body explaining why this is empty, and an optional action hint
// telling the operator how to populate it.
//
// The mark is a Phosphor glyph from EmptyIcon. Pass an explicit `Icon`
// when the usage doesn't fit a known shape.

export function EmptyState({
  Icon,
  title,
  body,
  action,
  size = "table",
}: {
  Icon?: ComponentType<IconProps>;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  size?: "table" | "panel";
}) {
  return (
    <div className={`${styles.emptyState} ${size === "panel" ? styles.emptyStatePanel : ""}`}>
      {Icon ? (
        <span className={styles.emptyStateMark}>
          <Icon size={18} weight="regular" aria-hidden />
        </span>
      ) : null}
      <p className={styles.emptyStateTitle}>{title}</p>
      {body ? <p className={styles.emptyStateBody}>{body}</p> : null}
      {action ? <div className={styles.emptyStateAction}>{action}</div> : null}
    </div>
  );
}
