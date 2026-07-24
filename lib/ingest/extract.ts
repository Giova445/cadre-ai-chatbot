// HTML → text extraction for the crawl front-end. Uses @mozilla/readability
// (the Firefox Reader View engine) over a linkedom DOM — pure-JS, no native
// binary, no headless browser — to strip nav/header/footer/sidebar boilerplate
// and return the MAIN article text plus the document title. A light
// HTML→markdown-ish pass keeps headings (as `#`) and lists so the downstream
// chunkMarkdown (REUSED, unchanged) still sees structure and can section.
//
// Detects both noindex signals the crawler honors from the HTML side:
//   <meta name="robots" content="noindex">  (X-Robots-Tag header is fetch-page's job)
//
// This module writes NO chunker/embedder/upsert — it only turns HTML into the
// { text, title, noindex } that lib/ingest/core.ingestSource consumes.

import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import type { ExtractResult } from "./types";

// Word floor for the "empty / JS-rendered" gate. ~30 words ≈ the chunker's
// MIN_TOKENS=40 (words * 1.3). Below this a page is treated as empty/no_text.
export const MIN_PAGE_WORDS = 30;

/** Count meaningful (whitespace-delimited) words in a block of text. */
export function wordCount(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** True when the parsed document carries <meta name="robots" content="noindex">. */
function hasNoindexMeta(document: Document): boolean {
  const metas = Array.from(document.querySelectorAll("meta"));
  for (const m of metas) {
    const name = (m.getAttribute("name") || "").toLowerCase();
    if (name !== "robots" && name !== "googlebot") continue;
    const content = (m.getAttribute("content") || "").toLowerCase();
    if (content.split(",").some((t) => t.trim() === "noindex" || t.trim() === "none")) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// HTML → markdown-ish. Readability yields a cleaned content DOM; we walk it and
// emit headings as `#`, list items as `- `, paragraphs as blank-line-separated
// blocks. This is deliberately light — chunkMarkdown only needs headings to
// section and blank lines to block; it does not need faithful markdown.
// ---------------------------------------------------------------------------
function htmlToMarkdown(root: Element | null): string {
  if (!root) return "";
  const out: string[] = [];

  const textOf = (el: Element): string =>
    (el.textContent || "").replace(/\s+/g, " ").trim();

  const walk = (node: Element): void => {
    const tag = node.tagName ? node.tagName.toLowerCase() : "";
    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Number(tag[1]);
        const t = textOf(node);
        if (t) out.push(`${"#".repeat(level)} ${t}`);
        return;
      }
      case "ul":
      case "ol": {
        const items = Array.from(node.children).filter(
          (c) => c.tagName && c.tagName.toLowerCase() === "li",
        );
        const lines = items.map((li) => `- ${textOf(li)}`).filter((l) => l !== "- ");
        if (lines.length) out.push(lines.join("\n"));
        return;
      }
      case "pre": {
        const t = (node.textContent || "").replace(/\s+$/g, "");
        if (t.trim()) out.push("```\n" + t + "\n```");
        return;
      }
      case "table": {
        // Keep tables atomic (chunkMarkdown never splits them). Render rows as
        // pipe-joined cells so the text is at least legible.
        const rows = Array.from(node.querySelectorAll("tr"));
        const lines = rows
          .map((tr) =>
            Array.from(tr.querySelectorAll("th,td"))
              .map((c) => textOf(c))
              .join(" | "),
          )
          .filter(Boolean);
        if (lines.length) out.push(lines.join("\n"));
        return;
      }
      case "p":
      case "blockquote": {
        const t = textOf(node);
        if (t) out.push(t);
        return;
      }
      case "br":
        return;
      default: {
        // Container — recurse into block children; if it has none, emit its text.
        const blockChildren = Array.from(node.children).filter((c) => c.tagName);
        if (blockChildren.length === 0) {
          const t = textOf(node);
          if (t) out.push(t);
          return;
        }
        for (const child of blockChildren) walk(child);
      }
    }
  };

  walk(root);
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extract the main article text + title from a page's HTML.
 * - Boilerplate (nav/header/footer/sidebar/ads) is stripped by Readability.
 * - `noindex` is true when the HTML carries a robots/googlebot noindex meta.
 * - `text` is markdown-ish (headings kept as `#`) so chunkMarkdown can section.
 *
 * Never throws: a page Readability cannot parse falls back to the body's text,
 * so the word-floor gate in the worker still makes the empty/no_text decision.
 */
export function extractHtml(html: string, url: string): ExtractResult {
  const { document } = parseHTML(html);
  const noindex = hasNoindexMeta(document);

  const rawTitle =
    (document.querySelector("title")?.textContent || "").trim() ||
    (document.querySelector("h1")?.textContent || "").trim();

  let text = "";
  let title = rawTitle;

  try {
    // Readability mutates the document; parse a fresh copy for its use.
    const { document: docForReader } = parseHTML(html);
    const reader = new Readability(docForReader as unknown as Document, {
      // Keep the URL so Readability can resolve relative links if it needs to.
      // (We do not emit links, but it avoids warnings.)
    });
    const article = reader.parse();
    if (article) {
      if (article.title && article.title.trim()) title = article.title.trim();
      // article.content is cleaned HTML of the main content; convert to md-ish.
      const { document: contentDoc } = parseHTML(
        `<!doctype html><html><body>${article.content || ""}</body></html>`,
      );
      text = htmlToMarkdown(contentDoc.body);
      // Fallback to Readability's plain textContent if the walk produced nothing.
      if (!text && article.textContent) text = article.textContent.trim();
    }
  } catch {
    // fall through to the body-text fallback below
  }

  if (!text) {
    // Last-resort fallback: strip the whole body to text (still gated by the
    // word floor upstream, so garbage-heavy pages are flagged, not embedded).
    text = htmlToMarkdown(document.body);
  }

  if (!title) title = url;

  return { text, title, noindex };
}
