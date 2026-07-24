import { describe, it, expect } from "vitest";
import { buildScriptSnippet, buildIframeSnippet, type EmbedSelection } from "@/lib/widget-snippet";
import { parseConfig } from "@/widget/src/config";

const BASE_SELECTION: EmbedSelection = {
  client: "acme",
  apiBase: "https://chat.gocadre.ai",
  mode: "launcher",
  target: null,
  color: "#db4545",
  position: "bottom-right",
  theme: "auto",
  greeting: "Hi! Ask me anything about Cadre AI.",
  launcherLabel: "Chat with us",
  contactUrl: "https://chat.gocadre.ai/contact",
};

// Parse a generated `<script data-*>` snippet's attributes back into a
// WidgetDataset the way a real browser's `.dataset` would (camelCase keys),
// so the round-trip test can feed it straight into `parseConfig`.
function extractDataset(snippet: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /data-([a-z-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet))) {
    const camel = m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = m[2];
  }
  return out;
}

function extractSrc(snippet: string): string {
  const m = /src="([^"]*)"/.exec(snippet);
  return m ? m[1] : "";
}

describe("buildScriptSnippet — default omission", () => {
  it("emits a bare snippet (only data-client) when every field is a brand default", () => {
    const snippet = buildScriptSnippet(BASE_SELECTION);
    expect(snippet).toContain('data-client="acme"');
    expect(snippet).not.toContain("data-color");
    expect(snippet).not.toContain("data-position");
    expect(snippet).not.toContain("data-theme");
    expect(snippet).not.toContain("data-greeting");
    expect(snippet).not.toContain("data-launcher-label");
    expect(snippet).not.toContain("data-contact-url");
    expect(snippet).not.toContain("data-mode");
    expect(snippet).not.toContain("data-api-base"); // src origin already IS apiBase
    expect(snippet).toContain("async");
    expect(extractSrc(snippet)).toBe("https://chat.gocadre.ai/widget.js");
  });

  it("emits non-default fields only", () => {
    const snippet = buildScriptSnippet({
      ...BASE_SELECTION,
      color: "#c23b22",
      position: "bottom-left",
      greeting: "Hi from Acme",
    });
    expect(snippet).toContain('data-color="#c23b22"');
    expect(snippet).toContain('data-position="bottom-left"');
    expect(snippet).toContain('data-greeting="Hi from Acme"');
  });
});

describe("buildScriptSnippet — inline mode", () => {
  it("emits data-mode + data-target, and omits launcher-only fields", () => {
    const snippet = buildScriptSnippet({
      ...BASE_SELECTION,
      mode: "inline",
      target: "#cadre-here",
      position: "bottom-left", // launcher-only; should still be omitted
      launcherLabel: "Ask Acme", // launcher-only; should still be omitted
    });
    expect(snippet).toContain('data-mode="inline"');
    expect(snippet).toContain('data-target="#cadre-here"');
    expect(snippet).not.toContain("data-position");
    expect(snippet).not.toContain("data-launcher-label");
  });
});

describe("buildScriptSnippet — escaping + sanitization", () => {
  it("HTML-escapes attribute values", () => {
    const snippet = buildScriptSnippet({
      ...BASE_SELECTION,
      greeting: 'Hi <b>"Acme"</b> & friends',
    });
    expect(snippet).toContain("&lt;b&gt;&quot;Acme&quot;&lt;/b&gt;");
    expect(snippet).not.toContain("<b>");
  });

  it("re-sanitizes the client id defensively", () => {
    const snippet = buildScriptSnippet({ ...BASE_SELECTION, client: "Acme! Corp" });
    expect(snippet).toContain('data-client="acmecorp"');
  });
});

describe("buildScriptSnippet — round-trip through parseConfig", () => {
  it("the emitted data-* attributes parse back to the selected config", () => {
    const selection: EmbedSelection = {
      ...BASE_SELECTION,
      color: "#111111",
      position: "bottom-left",
      theme: "dark",
      greeting: "Custom greeting",
      launcherLabel: "Talk to us",
    };
    const snippet = buildScriptSnippet(selection);
    const dataset = extractDataset(snippet);
    const src = extractSrc(snippet);

    const cfg = parseConfig(dataset, undefined, src);
    expect(cfg.client).toBe(selection.client);
    expect(cfg.color).toBe(selection.color);
    expect(cfg.position).toBe(selection.position);
    expect(cfg.theme).toBe(selection.theme);
    expect(cfg.greeting).toBe(selection.greeting);
    expect(cfg.launcherLabel).toBe(selection.launcherLabel);
    expect(cfg.mode).toBe("launcher");
  });

  it("inline selection round-trips mode + target", () => {
    const selection: EmbedSelection = {
      ...BASE_SELECTION,
      mode: "inline",
      target: "#cadre-mount",
    };
    const snippet = buildScriptSnippet(selection);
    const dataset = extractDataset(snippet);
    const src = extractSrc(snippet);

    const cfg = parseConfig(dataset, undefined, src);
    expect(cfg.mode).toBe("inline");
    expect(cfg.target).toBe("#cadre-mount");
  });
});

describe("buildIframeSnippet", () => {
  it("encodes the selection as query params on /embed/preview", () => {
    const snippet = buildIframeSnippet(BASE_SELECTION);
    expect(snippet).toContain("<iframe");
    expect(snippet).toContain('src="https://chat.gocadre.ai/embed/preview?client=acme"');
    expect(snippet).toContain('title="Cadre AI chat"');
    expect(snippet).toContain("loading=\"lazy\"");
  });

  it("carries non-default fields and URL-encodes them", () => {
    const snippet = buildIframeSnippet({
      ...BASE_SELECTION,
      color: "#c23b22",
      position: "bottom-left",
      mode: "inline",
      target: "#here",
    });
    expect(snippet).toContain("color=%23c23b22");
    expect(snippet).toContain("mode=inline");
    expect(snippet).toContain("target=%23here");
    expect(snippet).not.toContain("position="); // inline mode omits launcher-only position
  });
});
