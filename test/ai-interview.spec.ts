import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "./helpers";
import { encryptSecret } from "../worker/ai";

const BASE = "http://zenith.test";
const realFetch = globalThis.fetch;

function stubReply(text: string) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.anthropic.com/")) {
      return Promise.resolve(
        new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
          status: 200,
        }),
      );
    }
    return realFetch(input, init);
  });
}

afterEach(() => vi.unstubAllGlobals());

async function storeKey() {
  const enc = await encryptSecret(env, "sk-ant-test-key");
  await env.DB.prepare(
    "INSERT OR REPLACE INTO ai_credentials (user_id, ciphertext, iv, hint) VALUES ('seed-admin', ?, ?, 'key')",
  )
    .bind(enc!.ciphertext, enc!.iv)
    .run();
}

function interview(body: object) {
  return authedFetch(`${BASE}/api/ai/mock-interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AI mock interview", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      "DELETE FROM ai_credentials WHERE user_id = 'seed-admin'",
    ).run();
  });

  it("returns the interviewer's reply for the turn", async () => {
    await storeKey();
    stubReply("Tell me about a hard bug you fixed.");
    const res = await interview({
      context: { title: "Engineer", company: "Acme" },
      messages: [{ role: "user", content: "Please begin the interview." }],
    });
    expect(res.status).toBe(200);
    expect((await res.json<{ reply: string }>()).reply).toBe(
      "Tell me about a hard bug you fixed.",
    );
  });

  it("400s without a stored key", async () => {
    const res = await interview({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(400);
  });

  it("400s with no messages", async () => {
    await storeKey();
    const res = await interview({ context: {}, messages: [] });
    expect(res.status).toBe(400);
  });
});
