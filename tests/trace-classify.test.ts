import { describe, it, expect } from "vitest";
import { classifyForTrace } from "@/lib/trace";
import type { Decision } from "@/lib/guardrail";

const answered: Decision = {
  mode: "answer",
  reason: "grounded",
  citations: ["what-cadre-does.md"],
  topScore: 0.4,
  coverage: 1,
};

describe("classifyForTrace", () => {
  it("leaves a genuinely grounded, cited answer as mode=answer", () => {
    const text = "Cadre AI is an applied-AI consultancy. (source: what-cadre-does.md)";
    expect(classifyForTrace(answered, text)).toEqual(answered);
  });

  it("reclassifies an uncited reply (real bug repro: weather / greeting) to escalate", () => {
    const text = "I'm only able to help with questions about Cadre AI — is there something about our services I can help with?";
    const result = classifyForTrace(answered, text);
    expect(result.mode).toBe("escalate");
    expect(result.reason).toBe("weak_retrieval");
    expect(result.citations).toEqual([]);
  });

  it("does not touch non-answer decisions (refuse/escalate pass through unchanged)", () => {
    const refuse: Decision = { mode: "refuse", reason: "pricing", citations: [], topScore: 0.2, coverage: 0.5 };
    expect(classifyForTrace(refuse, "no pricing here")).toEqual(refuse);
  });

  it("matches a citation anywhere in a multi-paragraph answer", () => {
    const text = "Some intro text.\n\nMore detail here. (source: services.md)\n\nClosing line.";
    expect(classifyForTrace(answered, text).mode).toBe("answer");
  });
});
