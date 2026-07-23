// Empirical probe of the LIVE provider API (OpenRouter). Confirms — against real
// responses, not assumptions — (a) the usage shape a chat + an embedding call
// report, (b) where the charged `cost` lands, (c) whether a balance/usage endpoint
// exists, (d) real per-token pricing for the exact models in use.
//   node --env-file=.env.local --import tsx scripts/probe-usage.ts
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany, streamText } from "ai";

const CHAT_KEY = process.env.AI_CHAT_API_KEY ?? "";
const CHAT_BASE = process.env.AI_CHAT_BASE_URL ?? "";
const CHAT_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";
const EMB_KEY = process.env.EMBEDDINGS_API_KEY || CHAT_KEY;
const EMB_BASE = process.env.EMBEDDINGS_BASE_URL || CHAT_BASE;
const EMB_MODEL = "text-embedding-3-small";

function j(x: unknown) {
  return JSON.stringify(x, null, 2);
}

async function rest(path: string) {
  const url = `${CHAT_BASE.replace(/\/$/, "")}${path}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${CHAT_KEY}` } });
    const body = await r.json().catch(() => null);
    return { path, status: r.status, body };
  } catch (e) {
    return { path, error: (e as Error).message };
  }
}

async function main() {
  console.log("== ENV ==");
  console.log(j({ CHAT_BASE, CHAT_MODEL, EMB_BASE, EMB_MODEL, chatKeyPresent: Boolean(CHAT_KEY), embKeyPresent: Boolean(EMB_KEY) }));

  // --- REST: balance/usage endpoints (do they exist for this provider?) ---
  console.log("\n== GET /credits ==");
  console.log(j(await rest("/credits")));
  console.log("\n== GET /key ==");
  console.log(j(await rest("/key")));

  // --- REST: per-model pricing from /models for the exact models in use ---
  console.log("\n== /models pricing (chat + embed) ==");
  const models = await rest("/models");
  if (models.body && Array.isArray((models.body as { data?: unknown[] }).data)) {
    const data = (models.body as { data: Array<{ id: string; pricing?: unknown }> }).data;
    const want = [CHAT_MODEL, EMB_MODEL, `openai/${EMB_MODEL}`];
    for (const m of data) {
      if (want.includes(m.id)) console.log(j({ id: m.id, pricing: m.pricing }));
    }
  } else {
    console.log("models fetch:", j({ status: models.status }));
  }

  // --- Real chat call: what usage + cost does it report? ---
  console.log("\n== streamText usage (live chat call) ==");
  try {
    const provider = createOpenAI({ apiKey: CHAT_KEY, baseURL: CHAT_BASE || undefined });
    const r = streamText({ model: provider.chat(CHAT_MODEL), prompt: "Reply with exactly: hello there friend" });
    let text = "";
    for await (const d of r.textStream) text += d;
    const usage = await r.usage;
    const pm = await r.providerMetadata;
    console.log(j({ text, usage, providerMetadata: pm }));
  } catch (e) {
    console.log("CHAT FAILED:", (e as Error).message);
  }

  // --- Real embedding call: usage.tokens + any cost ---
  console.log("\n== embedMany usage (live embedding call) ==");
  try {
    const provider = createOpenAI({ apiKey: EMB_KEY, baseURL: EMB_BASE || undefined });
    const { usage, providerMetadata } = await embedMany({
      model: provider.embedding(EMB_MODEL),
      values: ["hello world this is a token usage probe"],
      providerOptions: { openai: { dimensions: 512 } },
    });
    console.log(j({ usage, providerMetadata }));
  } catch (e) {
    console.log("EMBED FAILED:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});
