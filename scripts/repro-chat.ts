// Repro / verification harness for the /api/chat streamText prompt.
//
// BEFORE the fix: buildMessages() put a system role in `messages`, and the
// Responses API threw AI_InvalidPromptError ("System messages are not allowed").
// AFTER the fix: system content is passed via streamText's `system` param and
// `messages` is user/assistant only, so prompt validation passes.
//
// Run with a DUMMY key to prove prompt VALIDATION (no network): after the fix
// the AI_InvalidPromptError is gone; any remaining error is a network/auth one,
// which proves the prompt itself is now valid.
//   node_modules/.bin/tsx scripts/repro-chat.ts
// Run with the real key to get a real streamed answer:
//   node --env-file=.env.local --import tsx scripts/repro-chat.ts

import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { buildSystem, buildConversation } from "../lib/prompt";

process.env.AI_CHAT_API_KEY ||= "sk-dummy-for-validation-only";

async function main() {
  const provider = createOpenAI({ apiKey: process.env.AI_CHAT_API_KEY });
  const model = provider(process.env.AI_MODEL ?? "gpt-4o-mini"); // Responses API

  const system = buildSystem([]);
  const messages = buildConversation({ query: "What does Cadre AI do?", history: [] });
  console.log("[repro] message roles ->", JSON.stringify(messages.map((m) => m.role)));
  console.log("[repro] system passed separately, length:", system.length);

  try {
    const result = streamText({ model, system, messages });
    let out = "";
    for await (const d of result.textStream) out += d;
    console.log("[repro] STREAM OK, first 120 chars:", out.slice(0, 120));
  } catch (e) {
    const err = e as { name?: string; message?: string };
    console.log("[repro] ERROR name   :", err?.name);
    console.log("[repro] ERROR message:", err?.message);
  }
}

main();
