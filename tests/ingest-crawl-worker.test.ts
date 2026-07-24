// content_hash change-detection (pure): the sha256 of extracted text is the
// dedup / change key. Equal text ⇒ equal hash ⇒ the worker's "unchanged" skip
// path (no embed); any change flips the hash ⇒ re-embed that URL only.

import { describe, it, expect } from "vitest";
import { contentHash } from "@/lib/ingest/crawl-worker";

describe("contentHash", () => {
  it("is deterministic for identical text", () => {
    expect(contentHash("Cadre AI grounds answers.")).toBe(
      contentHash("Cadre AI grounds answers."),
    );
  });

  it("changes when the text changes (drives re-embed)", () => {
    expect(contentHash("v1 content")).not.toBe(contentHash("v2 content"));
  });

  it("is a 64-char hex sha256 digest", () => {
    expect(contentHash("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinguishes whitespace-only differences", () => {
    expect(contentHash("a b")).not.toBe(contentHash("a  b"));
  });
});

// The unchanged-skip decision the worker makes, expressed as its pure predicate:
// an existing page whose stored hash equals the fresh hash is skipped without
// embedding. This mirrors crawl-worker.processPage step 4.
describe("change-detection decision", () => {
  const decide = (stored: string | null, fresh: string): "unchanged" | "embed" =>
    stored && stored === fresh ? "unchanged" : "embed";

  it("skips (no embed) when the stored hash matches", () => {
    const h = contentHash("same body");
    expect(decide(h, contentHash("same body"))).toBe("unchanged");
  });

  it("embeds when new (no stored hash)", () => {
    expect(decide(null, contentHash("new page"))).toBe("embed");
  });

  it("embeds when the body changed", () => {
    expect(decide(contentHash("old"), contentHash("new"))).toBe("embed");
  });
});
