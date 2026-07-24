// robots.txt parsing for UA "CadreBot": Disallow honored, wildcard group used
// when no UA-specific group exists, UA-specific group wins, Allow precedence.

import { describe, it, expect } from "vitest";
import { parseRobots } from "@/lib/ingest/robots";

describe("parseRobots — wildcard group", () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /admin\nDisallow: /private/\n`);
  it("disallows a matched prefix", () => {
    expect(rules.isAllowed("https://acme.com/admin")).toBe(false);
    expect(rules.isAllowed("https://acme.com/private/x")).toBe(false);
  });
  it("allows everything else", () => {
    expect(rules.isAllowed("https://acme.com/pricing")).toBe(true);
    expect(rules.isAllowed("https://acme.com/")).toBe(true);
  });
});

describe("parseRobots — UA-specific group wins", () => {
  const text = `User-agent: *\nDisallow: /\n\nUser-agent: CadreBot\nDisallow: /secret\n`;
  const rules = parseRobots(text);
  it("uses the CadreBot group (only /secret blocked), not the * block-all", () => {
    expect(rules.isAllowed("https://acme.com/pricing")).toBe(true);
    expect(rules.isAllowed("https://acme.com/secret")).toBe(false);
  });
});

describe("parseRobots — empty Disallow means allow-all", () => {
  const rules = parseRobots(`User-agent: *\nDisallow:\n`);
  it("allows every path", () => {
    expect(rules.isAllowed("https://acme.com/anything")).toBe(true);
  });
});

describe("parseRobots — Allow overrides a Disallow at equal/greater specificity", () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /docs\nAllow: /docs/public\n`);
  it("blocks /docs but allows the more specific /docs/public", () => {
    expect(rules.isAllowed("https://acme.com/docs/internal")).toBe(false);
    expect(rules.isAllowed("https://acme.com/docs/public/a")).toBe(true);
  });
});

describe("parseRobots — no groups", () => {
  it("allows all when robots.txt is empty", () => {
    expect(parseRobots("").isAllowed("https://acme.com/x")).toBe(true);
  });
});
