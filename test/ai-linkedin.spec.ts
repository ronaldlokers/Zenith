import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "./helpers";
import { encryptSecret } from "../worker/ai";

const BASE = "http://zenith.test";
const realFetch = globalThis.fetch;

function stubMessages(text: string) {
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

function review(body: { headline?: string; about?: string }) {
  return authedFetch(`${BASE}/api/ai/linkedin-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AI LinkedIn optimizer", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      "DELETE FROM ai_credentials WHERE user_id = 'seed-admin'",
    ).run();
  });

  it("returns a rewritten headline, About and tips", async () => {
    await storeKey();
    stubMessages(
      JSON.stringify({
        headline: "Platform Engineer · Kubernetes & Go · scaling teams",
        about: "I build reliable platforms…",
        tips: ["Add metrics", "Lead with keywords"],
      }),
    );
    const res = await review({
      headline: "engineer",
      about: "I do platform stuff at scale.",
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      headline: string;
      about: string;
      tips: string[];
    }>();
    expect(body.headline).toContain("Platform Engineer");
    expect(body.about).toContain("reliable platforms");
    expect(body.tips).toHaveLength(2);
  });

  it("400s without a stored key", async () => {
    const res = await review({ headline: "engineer", about: "stuff here ok" });
    expect(res.status).toBe(400);
  });

  it("400s when nothing meaningful is pasted", async () => {
    await storeKey();
    const res = await review({ headline: "x", about: "" });
    expect(res.status).toBe(400);
  });
});
