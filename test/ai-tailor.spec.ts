import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "./helpers";
import { encryptSecret } from "../worker/ai";

const BASE = "http://zenith.test";
const realFetch = globalThis.fetch;

// Stub the Worker's outbound call to Anthropic's /v1/messages.
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

function tailor(jobDescription: string) {
  return authedFetch(`${BASE}/api/ai/tailor-cv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobDescription }),
  });
}

const JD = "We need a strong backend engineer with distributed-systems and TypeScript experience.";

describe("AI resume tailoring", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ai_credentials WHERE user_id = 'seed-admin'"),
      env.DB.prepare("DELETE FROM work_experience WHERE user_id = 'seed-admin'"),
    ]);
  });

  it("returns tailored suggestions from the model", async () => {
    await storeKey();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO profile (user_id) VALUES ('seed-admin')",
    ).run();
    await env.DB.prepare(
      "UPDATE profile SET summary = 'old summary' WHERE user_id = 'seed-admin'",
    ).run();
    const { meta } = await env.DB.prepare(
      "INSERT INTO work_experience (user_id, company, title, description, sort_order, is_current) VALUES ('seed-admin', 'Acme', 'Engineer', 'did stuff', 0, 0)",
    ).run();
    const roleId = meta.last_row_id as number;

    stubMessages(
      JSON.stringify({
        summary: "new summary",
        experiences: [{ id: roleId, description: "tailored desc" }],
      }),
    );

    const res = await tailor(JD);
    expect(res.status).toBe(200);
    const body = await res.json<{
      summary: string;
      experiences: { id: number; description: string }[];
    }>();
    expect(body.summary).toBe("new summary");
    expect(body.experiences).toEqual([
      { id: roleId, description: "tailored desc" },
    ]);
  });

  it("strips a role-heading prefix the model echoes into the description", async () => {
    await storeKey();
    const { meta } = await env.DB.prepare(
      "INSERT INTO work_experience (user_id, company, title, description, sort_order, is_current) VALUES ('seed-admin', 'Acme', 'Engineer', 'x', 0, 0)",
    ).run();
    const roleId = meta.last_row_id as number;
    stubMessages(
      JSON.stringify({
        summary: "s",
        experiences: [{ id: roleId, description: "Engineer (Acme): tailored body" }],
      }),
    );
    const res = await tailor(JD);
    const body = await res.json<{
      experiences: { id: number; description: string }[];
    }>();
    expect(body.experiences).toEqual([
      { id: roleId, description: "tailored body" },
    ]);
  });

  it("drops suggestions for roles that aren't the user's", async () => {
    await storeKey();
    stubMessages(
      JSON.stringify({
        summary: "s",
        experiences: [{ id: 999999, description: "not mine" }],
      }),
    );
    const res = await tailor(JD);
    expect(res.status).toBe(200);
    expect((await res.json<{ experiences: unknown[] }>()).experiences).toEqual([]);
  });

  it("400s without a stored key", async () => {
    const res = await tailor(JD);
    expect(res.status).toBe(400);
  });

  it("400s on a too-short job description", async () => {
    await storeKey();
    const res = await tailor("short");
    expect(res.status).toBe(400);
  });
});
