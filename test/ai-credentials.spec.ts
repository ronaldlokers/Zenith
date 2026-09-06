import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "./helpers";
import { decryptSecret } from "../worker/ai";

const BASE = "http://zenith.test";
const realFetch = globalThis.fetch;

// The Worker validates a key by GETting api.anthropic.com/v1/models. Stub the
// global fetch it uses (test + worker share the isolate); everything else
// passes through. authedFetch/SELF is unaffected — it isn't global fetch.
function stubAnthropic(status: number, body?: unknown) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.anthropic.com/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(body ?? (status === 200 ? { data: [] } : {})),
          { status },
        ),
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

// Every failure but a 401 used to collapse into one message, in both
// directions: saving a good key during a transient rate limit answered "that
// API key was rejected by Anthropic", so people went and regenerated a key
// that was never broken. Three different situations, three different things
// to do — wait, top up, or replace the key.
describe("what the key check says went wrong", () => {
  const message = async (res: Response) =>
    ((await res.json()) as { error: string }).error;

  it("blames the key only when Anthropic actually rejected it", async () => {
    stubAnthropic(401);
    const res = await putKey("sk-ant-bad");
    expect(res.status).toBe(400);
    expect(await message(res)).toMatch(/rejected that API key/i);
  });

  it("does not call a rate-limited key a bad key", async () => {
    stubAnthropic(429);
    const res = await putKey("sk-ant-fine-but-busy");
    // 502, not 400: the key is not the thing that is wrong, and a 400 here is
    // what told people to regenerate a working key.
    expect(res.status).toBe(502);
    expect(await message(res)).toMatch(/rate-limiting/i);
  });

  it("names an empty account instead of blaming the key", async () => {
    // Anthropic sends this as a 400 whose message names the balance; the
    // error type is invalid_request_error either way, so only the message
    // separates it from a malformed request.
    stubAnthropic(400, {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Your credit balance is too low to access the Anthropic API.",
      },
    });
    const res = await putKey("sk-ant-broke");
    expect(await message(res)).toMatch(/out of credit/i);
  });

  it("says it is Anthropic's problem when it is", async () => {
    stubAnthropic(529);
    const res = await putKey("sk-ant-unlucky");
    expect(res.status).toBe(502);
    expect(await message(res)).toMatch(/having trouble/i);
  });

  it("does not report an unreachable API as a bad key", async () => {
    // A timeout or DNS failure says nothing about the key.
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://api.anthropic.com/")) {
        return Promise.reject(new Error("network down"));
      }
      return realFetch(input, init);
    });
    const res = await putKey("sk-ant-offline");
    expect(res.status).toBe(502);
    expect(await message(res)).not.toMatch(/rejected/i);
  });
});
