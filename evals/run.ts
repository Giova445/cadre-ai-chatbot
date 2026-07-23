// Golden-set eval runner (tsx-runnable, no test framework).
//
//   pnpm eval   # => runs after `pnpm embed` has produced data/embeddings.json
//
// For every golden case it reproduces the real request path — embed the
// question, retrieve top-k, run the deterministic guardrail, and materialize
// the exact text the user would see — then scores it against the case's
// expectation. Uses RELATIVE imports (tsx has no "@/" alias) and imports
// `retrieve` from ../lib/kb, which statically loads data/embeddings.json;
// that's why this runner must only be invoked after `pnpm embed`.

import golden from "./golden.json";
import type { GoldenCase } from "../lib/types";
import { retrieveText, EFFECTIVE_THRESHOLD } from "../lib/kb";
import { decide } from "../lib/guardrail";
import { groundedStub, responseForDecision } from "../lib/responses";

const cases = golden as GoldenCase[];

type Row = {
  id: string;
  expect: string;
  actual: string;
  topScore: string;
  citations: string;
  pass: boolean;
};

function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

async function runCase(c: GoldenCase): Promise<Row> {
  const results = await retrieveText(c.question);
  const decision = decide(c.question, results, EFFECTIVE_THRESHOLD);
  const output =
    decision.mode === "answer"
      ? groundedStub(results)
      : responseForDecision(decision);

  // A mustNotSay hit is an unconditional failure, whatever the expectation.
  const mustNotSay = c.mustNotSay ?? [];
  const mustNotHit = mustNotSay.some((s) => includesCI(output, s));

  let pass: boolean;
  if (mustNotHit) {
    pass = false;
  } else if (c.expect === "grounded") {
    const citesOk = (c.mustCite ?? []).every((f) =>
      decision.citations.includes(f),
    );
    pass = decision.mode === "answer" && citesOk;
  } else if (c.expect === "refuse") {
    pass = decision.mode === "refuse" || decision.mode === "escalate";
  } else {
    // expect === "escalate"
    pass = decision.mode === "escalate" || decision.mode === "refuse";
  }

  return {
    id: c.id,
    expect: c.expect,
    actual: decision.mode,
    topScore: decision.topScore.toFixed(4),
    citations: decision.citations.join(", ") || "-",
    pass,
  };
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function printTable(rows: Row[]): void {
  const cols: Array<[keyof Row, string, number]> = [
    ["id", "id", 20],
    ["expect", "expect", 10],
    ["actual", "actual", 10],
    ["topScore", "topScore", 10],
    ["citations", "citations", 40],
    ["pass", "result", 6],
  ];

  const header = cols.map(([, label, w]) => pad(label, w)).join("  ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    const line = cols
      .map(([key, , w]) => {
        const value =
          key === "pass" ? (row.pass ? "PASS" : "FAIL") : String(row[key]);
        return pad(value, w);
      })
      .join("  ");
    console.log(line);
  }
}

async function main(): Promise<void> {
  const rows: Row[] = [];
  for (const c of cases) {
    rows.push(await runCase(c));
  }

  printTable(rows);

  const passed = rows.filter((r) => r.pass).length;
  const total = rows.length;
  console.log("");
  console.log(`${passed}/${total} passed`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Eval runner failed:", err);
  process.exit(1);
});
