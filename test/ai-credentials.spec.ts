import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "./helpers";
import { decryptSecret } from "../worker/ai";

const BASE = "http://zenith.test";
const realFetch = globalThis.fetch;

// The Worker validates a key by GETting api.anthropic.com/v1/models. Stub the
// global fetch it uses (test + worker share the isolate); everything else
// passes through. authedFetch/SELF is unaffected — it isn't global fetch.
function stubAnthropic(status: number) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.anthropic.com/")) {
      return Promise.resolve(
        new Response(JSON.stringify(status === 200 ? { data: [] } : {}), {
          status,
        }),
      );
    }
    return realFetch(input, init);
  });
}

afterEach(() => vi.unstubAllGlobals());

function putKey(apiKey: string) {
  return authedFetch(`${BASE}/api/ai/credentials`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
}

describe("BYO Claude key", () => {
  it("validates, encrypts, and stores the key", async () => {
    stubAnthropic(200);
    const res = await putKey("sk-ant-secret-value-9999");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, hint: "9999" });

    const row = await env.DB.prepare(
      "SELECT ciphertext, iv FROM ai_credentials WHERE user_id = 'seed-admin'",
    ).first<{ ciphertext: string; iv: string }>();
    expect(row).not.toBeNull();
    expect(row!.ciphertext).not.toContain("sk-ant"); // not plaintext
    expect(await decryptSecret(env, row!.ciphertext, row!.iv)).toBe(
      "sk-ant-secret-value-9999",
    );
  });

  it("rejects a key Anthropic declines", async () => {
    stubAnthropic(401);
    const res = await putKey("sk-ant-bad");
    expect(res.status).toBe(400);
  });

  it("reports status without ever returning the key", async () => {
    stubAnthropic(200);
    await putKey("sk-ant-abcd-1234");
    const res = await authedFetch(`${BASE}/api/ai/credentials`);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ configured: true, hint: "1234" });
    expect(body).not.toContain("sk-ant");
    expect(body).not.toContain("ciphertext");
  });

  it("deletes the key", async () => {
    stubAnthropic(200);
    await putKey("sk-ant-zzzz-0000");
    let res = await authedFetch(`${BASE}/api/ai/credentials`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    res = await authedFetch(`${BASE}/api/ai/credentials`);
    expect(await res.json()).toEqual({ configured: false, hint: null });
  });
});
