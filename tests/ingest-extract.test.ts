// HTML extraction: boilerplate (nav/header/footer) stripped, main article kept,
// headings preserved as markdown (# …) so chunkMarkdown can section, noindex
// meta detected, and the word-count helper drives the empty/no_text floor.

import { describe, it, expect } from "vitest";
import { extractHtml, wordCount, MIN_PAGE_WORDS } from "@/lib/ingest/extract";

const ARTICLE_PARAGRAPH =
  "Cadre AI helps support teams answer questions from a grounded knowledge base. " +
  "It refuses to invent pricing and escalates to a human when retrieval is weak. " +
  "This paragraph is deliberately long enough to survive Readability's density heuristics " +
  "so that the main content is clearly the article and not the surrounding navigation chrome.";

const PAGE = `<!doctype html>
<html>
<head><title>Cadre AI — Support</title></head>
<body>
  <nav><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/login">Login</a></nav>
  <header>Global site header that should be stripped as boilerplate.</header>
  <article>
    <h1>About Cadre AI</h1>
    <p>${ARTICLE_PARAGRAPH}</p>
    <h2>How it works</h2>
    <p>${ARTICLE_PARAGRAPH}</p>
    <ul><li>Grounded answers</li><li>Escalation paths</li></ul>
  </article>
  <footer>Copyright 2026 Acme. Terms. Privacy. Cookie settings.</footer>
</body>
</html>`;

describe("extractHtml — boilerplate strip + structure", () => {
  const result = extractHtml(PAGE, "https://acme.com/about");

  it("keeps the main article text", () => {
    expect(result.text).toContain("helps support teams");
  });

  it("preserves headings as markdown so sectioning still works", () => {
    expect(result.text).toMatch(/#{1,2}\s+About Cadre AI|#{1,2}\s+How it works/);
  });

  it("drops nav/header/footer boilerplate", () => {
    expect(result.text).not.toContain("Cookie settings");
    expect(result.text.toLowerCase()).not.toContain("global site header");
  });

  it("resolves a title", () => {
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.title.toLowerCase()).toContain("cadre");
  });

  it("is not flagged noindex", () => {
    expect(result.noindex).toBe(false);
  });
});

describe("extractHtml — noindex meta", () => {
  it("detects <meta name=robots content=noindex>", () => {
    const html = `<html><head><meta name="robots" content="noindex, nofollow"><title>x</title></head><body><p>${ARTICLE_PARAGRAPH}</p></body></html>`;
    expect(extractHtml(html, "https://acme.com/x").noindex).toBe(true);
  });
  it("detects googlebot noindex too", () => {
    const html = `<html><head><meta name="googlebot" content="noindex"></head><body><p>hi</p></body></html>`;
    expect(extractHtml(html, "https://acme.com/x").noindex).toBe(true);
  });
});

describe("extractHtml — empty / JS-rendered page", () => {
  it("yields near-zero words for an empty SPA root", () => {
    const html = `<html><head><title>App</title></head><body><div id="root"></div></body></html>`;
    const { text } = extractHtml(html, "https://acme.com/app");
    expect(wordCount(text)).toBeLessThan(MIN_PAGE_WORDS);
  });
});

describe("wordCount", () => {
  it("counts whitespace-delimited words", () => {
    expect(wordCount("one two three")).toBe(3);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount("")).toBe(0);
  });
});
