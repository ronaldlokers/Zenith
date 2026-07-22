import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

// The user's own Anthropic API key, encrypted at rest with AES-GCM. The master
// key is the AI_KEY_ENCRYPTION_KEY secret (base64 32 bytes / AES-256); WebCrypto
// is already used for HMAC in public-api.ts. The stored key is write-only —
// decrypted only here, in the Worker, at call time; never returned to the
// client.

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function masterKey(env: Env): Promise<CryptoKey | null> {
  if (!env.AI_KEY_ENCRYPTION_KEY) return null;
  return crypto.subtle.importKey(
    "raw",
    b64ToBytes(env.AI_KEY_ENCRYPTION_KEY),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(
  env: Env,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string } | null> {
  const key = await masterKey(env);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: bytesToB64(new Uint8Array(enc)), iv: bytesToB64(iv) };
}

export async function decryptSecret(
  env: Env,
  ciphertext: string,
  iv: string,
): Promise<string | null> {
  const key = await masterKey(env);
  if (!key) return null;
  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(iv) },
    key,
    b64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(dec);
}

// Loads + decrypts the calling user's stored Anthropic key for the AI features.
// Returns null if none is stored or the master key is unset.
export async function getUserAnthropicKey(
  env: Env,
  userId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT ciphertext, iv FROM ai_credentials WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ ciphertext: string; iv: string }>();
  if (!row) return null;
  return decryptSecret(env, row.ciphertext, row.iv);
}

// Cheap auth check: /v1/models returns 200 for a valid key, 401 otherwise, and
// bills no tokens. Fixed host, so the url-guard (SSRF for user-supplied URLs)
// doesn't apply.
async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function registerAiRoutes(app: Hono<AppEnv>) {
  app.get("/api/ai/credentials", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT hint FROM ai_credentials WHERE user_id = ?",
    )
      .bind(c.get("userId"))
      .first<{ hint: string | null }>();
    return c.json({ configured: !!row, hint: row?.hint ?? null });
  });

  app.put("/api/ai/credentials", async (c) => {
    if (!c.env.AI_KEY_ENCRYPTION_KEY) {
      return c.json({ error: "AI keys are not enabled on this server" }, 503);
    }
    const { apiKey } = await c.req.json<{ apiKey?: string }>();
    if (!apiKey || typeof apiKey !== "string") {
      return c.json({ error: "apiKey is required" }, 400);
    }
    if (!(await validateAnthropicKey(apiKey))) {
      return c.json({ error: "that API key was rejected by Anthropic" }, 400);
    }
    const enc = await encryptSecret(c.env, apiKey);
    if (!enc) {
      return c.json({ error: "AI keys are not enabled on this server" }, 503);
    }
    const hint = apiKey.slice(-4);
    await c.env.DB.prepare(
      `INSERT INTO ai_credentials (user_id, ciphertext, iv, hint) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         ciphertext = excluded.ciphertext, iv = excluded.iv,
         hint = excluded.hint, created_at = datetime('now')`,
    )
      .bind(c.get("userId"), enc.ciphertext, enc.iv, hint)
      .run();
    return c.json({ configured: true, hint });
  });

  app.delete("/api/ai/credentials", async (c) => {
    await c.env.DB.prepare("DELETE FROM ai_credentials WHERE user_id = ?")
      .bind(c.get("userId"))
      .run();
    return c.body(null, 204);
  });
}
