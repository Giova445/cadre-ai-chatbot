// Fragment-composition sanity for the admin repo SQL filter builders — no DB.
// A fake `postgres` sql tag records the literal template parts + interpolated
// values, so we can assert each builder OMITS the predicate when its value is
// absent and EMITS a single bound `= $1` predicate when present (the exact
// compose-or-omit contract repos.ts / flag-repo.ts rely on).

import { describe, it, expect } from "vitest";
import { clientFilter, sessionFilter } from "@/lib/admin/filters";

type Captured = { strings: string[]; values: unknown[] };

// Cast target: the builders type their first arg as the real postgres Sql tag.
type SqlArg = Parameters<typeof clientFilter>[0];

function makeFakeSql(): SqlArg {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Captured => ({
    strings: Array.from(strings),
    values,
  });
  return tag as unknown as SqlArg;
}

function capture(fragment: unknown): Captured {
  return fragment as Captured;
}

describe("clientFilter", () => {
  it("emits a single bound client_id predicate when a client is given", () => {
    const frag = capture(clientFilter(makeFakeSql(), "acme"));
    expect(frag.values).toEqual(["acme"]);
    expect(frag.strings.join("")).toContain("client_id");
    expect(frag.strings.join("")).toContain("and");
  });

  it("omits the predicate (empty fragment) when the client is undefined", () => {
    const frag = capture(clientFilter(makeFakeSql(), undefined));
    expect(frag.values).toEqual([]);
    expect(frag.strings.join("")).toBe("");
  });

  it("treats an empty-string client as absent (unscoped)", () => {
    const frag = capture(clientFilter(makeFakeSql(), ""));
    expect(frag.values).toEqual([]);
    expect(frag.strings.join("")).toBe("");
  });
});

describe("sessionFilter", () => {
  it("emits a single bound session_id predicate when a session is given", () => {
    const frag = capture(sessionFilter(makeFakeSql(), "sess-abc"));
    expect(frag.values).toEqual(["sess-abc"]);
    expect(frag.strings.join("")).toContain("session_id");
    expect(frag.strings.join("")).toContain("and");
  });

  it("omits the predicate (empty fragment) when the session is undefined", () => {
    const frag = capture(sessionFilter(makeFakeSql(), undefined));
    expect(frag.values).toEqual([]);
    expect(frag.strings.join("")).toBe("");
  });
});
