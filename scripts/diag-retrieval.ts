// Diagnostic: show what the current retriever returns (top-8) for the queries
// that declined in the stress test. Tells us whether the answering chunk is
// reachable (raise top-k) or ranked too low (needs better weighting).
// Run: node_modules/.bin/tsx scripts/diag-retrieval.ts

import { retrieveText, getKB } from "../lib/kb";

const FILE = getKB();

const QUERIES = [
  "Where are you based?",
  "What industries do you help?",
  "Tell me about your company.",
  "What's your story?",
  "How big is your team?",
  "What do you do?",
];

async function main() {
  console.log(`embedder=${FILE.model} chunks=${FILE.chunks.length}\n`);
  for (const q of QUERIES) {
    const top = await retrieveText(q, 8);
    console.log(`Q: "${q}"`);
    for (const r of top) {
      console.log(
        `   ${r.score.toFixed(4)}  ${r.chunk.meta.source} :: ${r.chunk.meta.section}`,
      );
    }
    console.log("");
  }
}

main();
