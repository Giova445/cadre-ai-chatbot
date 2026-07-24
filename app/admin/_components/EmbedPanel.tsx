"use client";

import { useMemo, useState } from "react";
import { buildScriptSnippet, buildIframeSnippet, type EmbedSelection } from "@/lib/widget-snippet";
import { DEFAULT_GREETING, type WidgetMode, type WidgetPosition } from "@/widget/src/config";
import { CopyButton } from "./CopyButton";
import { EmbedPreview } from "./EmbedPreview";
import styles from "../admin.module.css";

const DEFAULT_TARGET = "#cadre-here";
const BRAND_COLOR = "#db4545";

// The appearance form + generated snippet + live preview for one client
// (Admin § A2). A client island: the surrounding page (Server Component)
// resolves the client id and our deploy origin; everything below is a pure
// function of local form state plus lib/widget-snippet's pure builders — no
// Server Action, no mutation (this screen reads + generates only, § A8).
export function EmbedPanel({ client, apiBase }: { client: string; apiBase: string }) {
  const [mode, setMode] = useState<WidgetMode>("launcher");
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [color, setColor] = useState(BRAND_COLOR);
  const [position, setPosition] = useState<WidgetPosition>("bottom-right");
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [format, setFormat] = useState<"script" | "iframe">("script");

  const selection: EmbedSelection = useMemo(
    () => ({
      client,
      apiBase,
      mode,
      target: mode === "inline" ? target || null : null,
      color,
      position,
      theme: "auto",
      greeting,
      launcherLabel: "Chat with us",
      contactUrl: `${apiBase}/contact`,
    }),
    [client, apiBase, mode, target, color, position, greeting],
  );

  const scriptSnippet = useMemo(() => buildScriptSnippet(selection), [selection]);
  const iframeSnippet = useMemo(() => buildIframeSnippet(selection), [selection]);
  const activeSnippet = format === "script" ? scriptSnippet : iframeSnippet;

  const previewSrc = useMemo(() => {
    const params = new URLSearchParams({ client, mode });
    if (mode === "inline" && target) params.set("target", target);
    if (color) params.set("color", color);
    if (mode === "launcher" && position) params.set("position", position);
    if (greeting) params.set("greeting", greeting);
    return `/embed/preview?${params.toString()}`;
  }, [client, mode, target, color, position, greeting]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Embed</h1>
        <p className={styles.pageSub}>
          client <code>{client}</code>
        </p>
      </div>

      <p className={styles.pageNote}>
        Copy-paste snippet for embedding the Cadre AI chat widget on this client&apos;s site. The
        snippet carries only the public client id and this deploy&apos;s origin — no key or secret
        ever leaves the server.
      </p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <form
          className={styles.starterEditor}
          style={{ flex: "1 1 320px", minWidth: 280 }}
          aria-label="Widget appearance"
        >
          <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <legend className={styles.flagFormLabel}>Mode</legend>
            <label className={styles.flagFormField} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="radio"
                name="embed-mode"
                value="launcher"
                checked={mode === "launcher"}
                onChange={() => setMode("launcher")}
              />
              Launcher (floating bubble)
            </label>
            <label className={styles.flagFormField} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="radio"
                name="embed-mode"
                value="inline"
                checked={mode === "inline"}
                onChange={() => setMode("inline")}
              />
              Inline (embedded in page flow)
            </label>
          </fieldset>

          {mode === "inline" && (
            <label className={styles.flagFormField}>
              <span className={styles.flagFormLabel}>Target selector</span>
              <input
                className={styles.flagInput}
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={DEFAULT_TARGET}
                aria-describedby="embed-target-hint"
              />
              <span id="embed-target-hint" className={styles.starterHint}>
                A CSS selector for the element the widget mounts into on the client&apos;s page.
              </span>
            </label>
          )}

          {mode === "launcher" && (
            <label className={styles.flagFormField}>
              <span className={styles.flagFormLabel}>Position</span>
              <select
                className={styles.flagSelect}
                value={position}
                onChange={(e) => setPosition(e.target.value as WidgetPosition)}
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
              </select>
            </label>
          )}

          <label className={styles.flagFormField}>
            <span className={styles.flagFormLabel}>Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Accent color"
              style={{ width: 60, height: 34, padding: 2, border: "none", background: "transparent" }}
            />
          </label>

          <label className={styles.flagFormField}>
            <span className={styles.flagFormLabel}>Greeting</span>
            <input
              className={styles.flagInput}
              type="text"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              maxLength={160}
            />
          </label>
        </form>

        <EmbedPreview src={previewSrc} />
      </div>

      <div className={styles.tracePanel}>
        <div className={styles.traceHead}>
          <button
            type="button"
            className={format === "script" ? styles.filterChipActive : styles.filterChip}
            onClick={() => setFormat("script")}
          >
            Script loader
          </button>
          <button
            type="button"
            className={format === "iframe" ? styles.filterChipActive : styles.filterChip}
            onClick={() => setFormat("iframe")}
          >
            Iframe fallback
          </button>
          <CopyButton value={activeSnippet} />
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            fontSize: 12.5,
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {activeSnippet}
        </pre>
      </div>
    </div>
  );
}
