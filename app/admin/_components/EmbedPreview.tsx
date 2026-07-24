"use client";

import type { WidgetMode, WidgetPosition } from "@/widget/src/config";
import styles from "../admin.module.css";

// Live, themed preview (Admin § A5): an isolated iframe pointing at the
// chromeless `/embed/preview` route, which boots the REAL public/widget.js
// with the selected config applied — so what the operator sees is exactly
// what a client's visitor gets (preview == production, not a re-implemented
// mock). `key={src}` forces a full reboot of the widget on any config change
// rather than trying to hot-patch a running instance.
export function EmbedPreview({
  src,
  mode,
  position,
}: {
  src: string;
  mode: WidgetMode;
  position: WidgetPosition;
}) {
  return (
    <div className={styles.embedPreview}>
      <div className={styles.embedPreviewChrome}>
        <span className={styles.embedPreviewLabel}>Live preview</span>
        <span className={styles.embedPreviewPill}>
          {mode === "launcher" ? `Launcher · ${positionLabel(position)}` : "Inline"}
        </span>
      </div>
      <div
        className={styles.embedPreviewStage}
        data-mode={mode}
        data-position={position}
      >
        <iframe
          key={src}
          src={src}
          title="Cadre AI widget preview"
          // same-origin (not a third-party origin) so the real bundle can read
          // its config + call our own APIs; no allow-top-navigation/allow-popups.
          sandbox="allow-scripts allow-same-origin"
          className={styles.embedPreviewFrame}
        />
      </div>
      <p className={styles.embedPreviewCaption}>
        Renders the production <code>/widget.js</code> bundle — what a visitor sees is what
        ships.
      </p>
    </div>
  );
}

function positionLabel(p: WidgetPosition): string {
  return p === "bottom-left" ? "bottom-left" : "bottom-right";
}
