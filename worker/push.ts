import type { Hono } from "hono";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { AppEnv } from "./index.js";

// Web Push (#214) — encryption/JWT handled by @block65/webcrypto-web-push
// (Web Crypto API only, no Node http/https module, so it actually works
// in the Workers runtime unlike the mainstream `web-push` npm package).
// VAPID keys are a locally-generated keypair (scripts/generate-vapid-
// keys.mjs), not an account/signup with any provider.

function vapidFromEnv(env: Env) {
  return {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
}

export async function sendPushToUser(
  env: Env,
  userId: string,
  message: { title: string; body?: string; url?: string },
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const { results } = await env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ id: number; endpoint: string; p256dh: string; auth: string }>();

  await Promise.all(
    results.map(async (sub) => {
      try {
        const payload = await buildPushPayload(
          {
            data: {
              title: message.title,
              body: message.body ?? "",
              url: message.url ?? "/",
            },
            options: { ttl: 86400, urgency: "normal" },
          },
          {
            endpoint: sub.endpoint,
            expirationTime: null,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          vapidFromEnv(env),
        );
        const res = await fetch(sub.endpoint, {
          method: payload.method,
          headers: payload.headers,
          body: payload.body,
        });
        // 404/410 means the browser dropped the subscription (uninstalled,
        // revoked permission, etc.) — clean it up rather than retrying
        // a dead endpoint on every future notification.
        if (res.status === 404 || res.status === 410) {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?")
            .bind(sub.id)
            .run();
        }
      } catch {
        // best effort — one subscriber's failure shouldn't block others
      }
    }),
  );
}

export function registerPushRoutes(app: Hono<AppEnv>) {
  app.get("/api/push/public-key", async (c) => {
    if (!c.env.VAPID_PUBLIC_KEY) return c.json({ publicKey: null });
    return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
  });

  app.post("/api/push/subscribe", async (c) => {
    const body = await c.req.json();
    const { endpoint, keys } = body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return c.json({ error: "endpoint and keys are required" }, 400);
    }
    await c.env.DB.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(c.get("userId"), endpoint, keys.p256dh, keys.auth)
      .run();
    return c.body(null, 204);
  });

  app.post("/api/push/unsubscribe", async (c) => {
    const body = await c.req.json();
    await c.env.DB.prepare(
      "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
    )
      .bind(body?.endpoint, c.get("userId"))
      .run();
    return c.body(null, 204);
  });
}
