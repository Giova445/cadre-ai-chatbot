"use client";

import styles from "../admin.module.css";

// Live, themed preview (Admin § A5): an isolated iframe pointing at the
// chromeless `/embed/preview` route, which boots the REAL public/widget.js
// with the selected config applied — so what the operator sees is exactly
// what a client's visitor gets (preview == production, not a re-implemented
// mock). `key={src}` forces a full reboot of the widget on any config change
// rather than trying to hot-patch a running instance.
export function EmbedPreview({ src }: { src: string }) {
  return (
    <div className={styles.previewPanel}>
      <p className={styles.previewTitle}>Live preview</p>
      <iframe
        key={src}
        src={src}
        title="Cadre AI widget preview"
        // same-origin (not a third-party origin) so the real bundle can read
        // its config + call our own APIs; no allow-top-navigation/allow-popups.
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: "100%",
          height: 460,
          border: "1px solid var(--line, #2c2820)",
          borderRadius: 8,
          background: "#fff",
        }}
      />
    </div>
  );
}
