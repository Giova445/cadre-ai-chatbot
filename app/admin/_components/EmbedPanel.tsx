"use client";

import { useMemo, useState } from "react";
import { buildScriptSnippet, buildIframeSnippet, type EmbedSelection } from "@/lib/widget-snippet";
import { DEFAULT_GREETING, type WidgetMode, type WidgetPosition } from "@/widget/src/config";
import { CopyButton } from "./CopyButton";
import { EmbedPreview } from "./EmbedPreview";
import styles from "../admin.module.css";

const DEFAULT_TARGET = "#cadre-here";
const BRAND_COLOR = "#db4545";

type ModeId = WidgetMode;
type PositionId = WidgetPosition;

const MODES: { id: ModeId; label: string; hint: string }[] = [
  { id: "launcher", label: "Launcher", hint: "Floating bubble in the corner." },
  { id: "inline", label: "Inline", hint: "Mounts into a target element in page flow." },
];

const POSITIONS: { id: PositionId; label: string }[] = [
  { id: "bottom-right", label: "Bottom right" },
  { id: "bottom-left", label: "Bottom left" },
];

// The appearance configurator + live preview + generated snippet for one
// client (Admin § A2). A client island: the surrounding page (Server
// Component) resolves the client id and our deploy origin; everything below is
// a pure function of local form state plus lib/widget-snippet's pure builders —
// no Server Action, no mutation (this screen reads + generates only, § A8).
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

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];

  return (
    <div className={styles.embedShell}>
      <div className={styles.embedHead}>
        <div>
          <p className={styles.embedEyebrow}>Embed</p>
          <h1 className={styles.embedTitle}>Widget snippet</h1>
          <p className={styles.embedSub}>
            Copy-paste the snippet to embed the Cadre AI chat on{" "}
            <code className={styles.embedCode}>{client}</code>. The snippet carries only the public
            client id and this deploy's origin — no key or secret ever leaves the server.
          </p>
        </div>
        <a
          className={styles.embedHelpLink}
          href="/contact"
          target="_blank"
          rel="noopener noreferrer"
        >
          Snippet docs
        </a>
      </div>

      <div className={styles.embedGrid}>
        <form className={styles.embedConfig} aria-label="Widget appearance">
          <section className={styles.embedFieldGroup}>
            <span className={styles.embedGroupLabel}>Mode</span>
            <div className={styles.embedSegmented} role="radiogroup" aria-label="Widget mode">
              {MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`${styles.embedSeg} ${active ? styles.embedSegActive : ""}`}
                    onClick={() => setMode(m.id)}
                  >
                    <span className={styles.embedSegLabel}>{m.label}</span>
                  </button>
                );
              })}
            </div>
            <p className={styles.embedGroupHint}>{activeMode.hint}</p>
          </section>

          {mode === "inline" && (
            <section className={styles.embedFieldGroup}>
              <label className={styles.embedLabel} htmlFor="embed-target">
                Target selector
              </label>
              <input
                id="embed-target"
                className={styles.embedInput}
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={DEFAULT_TARGET}
                aria-describedby="embed-target-hint"
                spellCheck={false}
              />
              <p id="embed-target-hint" className={styles.embedHint}>
                A CSS selector for the element the widget mounts into on the client's page.
              </p>
            </section>
          )}

          {mode === "launcher" && (
            <section className={styles.embedFieldGroup}>
              <span className={styles.embedGroupLabel}>Position</span>
              <div
                className={styles.embedSegmented}
                role="radiogroup"
                aria-label="Launcher position"
              >
                {POSITIONS.map((p) => {
                  const active = position === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`${styles.embedSeg} ${active ? styles.embedSegActive : ""}`}
                      onClick={() => setPosition(p.id)}
                    >
                      <span className={styles.embedSegLabel}>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <div className={styles.embedTwoCol}>
            <section className={styles.embedFieldGroup}>
              <label className={styles.embedLabel} htmlFor="embed-color">
                Accent color
              </label>
              <div className={styles.embedColorRow}>
                <span
                  className={styles.embedSwatch}
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <input
                  id="embed-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="Accent color"
                  className={styles.embedColorInput}
                />
                <code className={styles.embedSwatchCode}>{color.toUpperCase()}</code>
              </div>
            </section>

            <section className={styles.embedFieldGroup}>
              <label className={styles.embedLabel} htmlFor="embed-greeting">
                Greeting
              </label>
              <input
                id="embed-greeting"
                className={styles.embedInput}
                type="text"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                maxLength={160}
                placeholder={DEFAULT_GREETING}
              />
            </section>
          </div>
        </form>

        <EmbedPreview src={previewSrc} mode={mode} position={position} />
      </div>

      <div className={styles.embedSnippet}>
        <div className={styles.embedSnippetHead}>
          <div
            className={styles.embedSegmented}
            role="tablist"
            aria-label="Snippet format"
          >
            <button
              type="button"
              role="tab"
              aria-selected={format === "script"}
              className={`${styles.embedSeg} ${format === "script" ? styles.embedSegActive : ""}`}
              onClick={() => setFormat("script")}
            >
              <span className={styles.embedSegLabel}>Script loader</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={format === "iframe"}
              className={`${styles.embedSeg} ${format === "iframe" ? styles.embedSegActive : ""}`}
              onClick={() => setFormat("iframe")}
            >
              <span className={styles.embedSegLabel}>Iframe fallback</span>
            </button>
          </div>
          <CopyButton value={activeSnippet} />
        </div>
        <pre className={styles.embedSnippetCode}>{activeSnippet}</pre>
      </div>
    </div>
  );
}
