import { Hono } from "hono";
import type { AppEnv } from "./index.js";

// Public read-only API + webhooks (#228). Separate /api/v1/* namespace
// (rather than reusing /api/*) so Bearer-key auth and session-cookie
// auth never have to share one middleware's assumptions — the two
// stay independent even if either changes later.

export function registerApiKeyRoutes(app: Hono<AppEnv>) {
  app.post("/api/profile/api-key", async (c) => {
    const token = crypto.randomUUID();
    const userId = c.get("userId");
    await c.env.DB.prepare(
      "INSERT INTO profile (user_id, api_key) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET api_key = excluded.api_key",
    )
      .bind(userId, token)
      .run();
    return c.json({ api_key: token });
  });

  app.delete("/api/profile/api-key", async (c) => {
    await c.env.DB.prepare("UPDATE profile SET api_key = NULL WHERE user_id = ?")
      .bind(c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  app.get("/api/webhooks", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, url, enabled, created_at FROM webhooks WHERE user_id = ? ORDER BY created_at DESC",
    )
      .bind(c.get("userId"))
      .all();
    return c.json(results);
  });

  app.post("/api/webhooks", async (c) => {
    const body = await c.req.json();
    const url = (body.url ?? "").trim();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return c.json({ error: "url must be a valid URL" }, 400);
    }
    if (parsed.protocol !== "https:") {
      return c.json({ error: "url must be https" }, 400);
    }
    const secret = crypto.randomUUID().replace(/-/g, "");
    const result = await c.env.DB.prepare(
      "INSERT INTO webhooks (user_id, url, secret) VALUES (?, ?, ?) RETURNING id, url, secret, enabled, created_at",
    )
      .bind(c.get("userId"), url, secret)
      .first();
    // secret only ever appears in this one response — shown once at
    // creation, same as the 2FA backup codes, since it can't be
    // recovered later (only the hash-equivalent use of it can).
    return c.json(result, 201);
  });

  app.delete("/api/webhooks/:id", async (c) => {
    await c.env.DB.prepare("DELETE FROM webhooks WHERE id = ? AND user_id = ?")
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Fired on every application status change (#228). Best effort — a
// receiver's downtime or slow response never blocks the request that
// triggered it, same reasoning as sendPushToUser.
export async function triggerWebhooks(
  env: Env,
  userId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT url, secret FROM webhooks WHERE user_id = ? AND enabled = 1",
  )
    .bind(userId)
    .all<{ url: string; secret: string }>();
  if (results.length === 0) return;

  const body = JSON.stringify({ event, data, sent_at: new Date().toISOString() });
  await Promise.all(
    results.map(async (hook) => {
      try {
        const signature = await hmacHex(hook.secret, body);
        await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-JobSeekr-Signature": signature,
          },
          body,
          // A slow/hanging receiver must not tie up the delivery (#285); the
          // callers run this via ctx.waitUntil, but bound each attempt too.
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // best effort
      }
    }),
  );
}

const applicationColumns =
  "id, company_id, title, role_type, url, source, status, notes, applied_at, next_action, next_action_at, deadline_at, fit_score, created_at, updated_at";

export function registerPublicApiRoutes(app: Hono<AppEnv>) {
  const api = new Hono<{ Bindings: Env; Variables: { apiUserId: string } }>();

  api.use("*", async (c, next) => {
    const auth = c.req.header("Authorization");
    const key = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!key) return c.json({ error: "missing bearer token" }, 401);
    const profile = await c.env.DB.prepare(
      "SELECT user_id FROM profile WHERE api_key = ?",
    )
      .bind(key)
      .first<{ user_id: string }>();
    if (!profile) return c.json({ error: "invalid API key" }, 401);
    c.set("apiUserId", profile.user_id);
    await next();
  });

  api.get("/applications", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT ${applicationColumns} FROM applications WHERE user_id = ? ORDER BY updated_at DESC`,
    )
      .bind(c.get("apiUserId"))
      .all();
    return c.json(results);
  });

  api.get("/applications/:id", async (c) => {
    const result = await c.env.DB.prepare(
      `SELECT ${applicationColumns} FROM applications WHERE id = ? AND user_id = ?`,
    )
      .bind(c.req.param("id"), c.get("apiUserId"))
      .first();
    if (!result) return c.json({ error: "not found" }, 404);
    return c.json(result);
  });

  app.route("/api/v1", api);
}
