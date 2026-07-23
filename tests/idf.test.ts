import { describe, it, expect } from "vitest";
import { computeIdf, lexicalEmbed, tokenize } from "@/lib/llm";
import { cosineSimilarity, magnitude } from "@/lib/retrieval";

describe("computeIdf", () => {
  it("weighs a rare term higher than a term in every doc", () => {
    const corpus = ["alpha common", "beta common", "gamma common", "rareword common"];
    const idf = computeIdf(corpus);
    expect(idf["rareword"]).toBeGreaterThan(idf["common"]);
  });

  it("produces positive, finite weights (ln((N+1)/(df+1))+1)", () => {
    const idf = computeIdf(["a b", "b c"]);
    for (const v of Object.values(idf)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe("lexicalEmbed idf weighting", () => {
  it("differs from the unweighted vector", () => {
    const idf = { alpha: 3, beta: 1 };
    expect(lexicalEmbed("alpha beta", idf)).not.toEqual(lexicalEmbed("alpha beta"));
  });

  it("stays L2-normalized with idf", () => {
    const v = lexicalEmbed("alpha beta gamma", { alpha: 2, beta: 3, gamma: 1 });
    expect(magnitude(v)).toBeCloseTo(1, 6);
  });

  it("makes a distinctive shared term dominate similarity", () => {
    const idf = { zephyr: 4, notes: 1, plan: 1, report: 1 };
    const q = lexicalEmbed("zephyr", idf);
    const withRare = lexicalEmbed("zephyr notes plan", idf);
    const withoutRare = lexicalEmbed("notes plan report", idf);
    expect(cosineSimilarity(q, withRare)).toBeGreaterThan(
      cosineSimilarity(q, withoutRare),
    );
  });
});

describe("tokenize short-query fallback", () => {
  it("keeps function words when there are <2 content tokens (avoids a zero vector)", () => {
    expect(tokenize("what do you do").length).toBeGreaterThan(0);
  });

  it("strips stopwords when there are >=2 content tokens", () => {
    const toks = tokenize("the maturity index diagnostic");
    expect(toks).toContain("maturity");
    expect(toks).not.toContain("the");
  });
});
