import { guardedFetch, isForbiddenUrl } from "./url-guard.js";

// Consecutive delivery failures before a webhook is switched off (#346).
const WEBHOOK_DISABLE_AFTER = 10;
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "./index.js";

// Public read-only API + webhooks (#228). Separate /api/v1/* namespace
// (rather than reusing /api/*) so Bearer-key auth and session-cookie
// auth never have to share one middleware's assumptions — the two
// stay independent even if either changes later.

// The key is stored as a SHA-256 digest (#381), never in the clear. Plain
// SHA-256 rather than a password KDF because the key is CSPRNG output, not
// a memorised secret: there's nothing to dictionary-attack and no salt to
// add, and the lookup stays one indexed equality.
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function registerApiKeyRoutes(app: Hono<AppEnv>) {
  app.post("/api/profile/api-key", async (c) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    const userId = c.get("userId");
    // Shown once, in this response only — the digest is all that's kept, so
    // there is no later read path to recover it from.
    await c.env.DB.prepare(
      `INSERT INTO profile (user_id, api_key_hash, api_key_hint, api_key_created_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (user_id) DO UPDATE SET
         api_key_hash = excluded.api_key_hash,
         api_key_hint = excluded.api_key_hint,
         api_key_created_at = excluded.api_key_created_at`,
    )
      .bind(userId, await sha256Hex(token), token.slice(-4))
      .run();
    return c.json({ api_key: token });
  });

  app.delete("/api/profile/api-key", async (c) => {
    await c.env.DB.prepare(
      "UPDATE profile SET api_key_hash = NULL, api_key_hint = NULL, api_key_created_at = NULL WHERE user_id = ?",
    )
      .bind(c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  app.get("/api/webhooks", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, url, enabled, created_at, last_status, last_attempt_at, failure_count FROM webhooks WHERE user_id = ? ORDER BY created_at DESC",
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
    if (isForbiddenUrl(parsed)) {
      return c.json({ error: "url points at a forbidden host" }, 400);
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
    "SELECT id, url, secret, failure_count FROM webhooks WHERE user_id = ? AND enabled = 1",
  )
    .bind(userId)
    .all<{ id: number; url: string; secret: string; failure_count: number }>();
  if (results.length === 0) return;

  const body = JSON.stringify({ event, data, sent_at: new Date().toISOString() });
  await Promise.all(
    results.map(async (hook) => {
      // One delivery attempt; non-2xx counts as failure.
      const attempt = async () => {
        const signature = await hmacHex(hook.secret, body);
        // guardedFetch re-applies the SSRF policy on every redirect hop
        // (security review, #445): a receiver that 3xx-redirects the delivery
        // to an internal address is otherwise followed blindly. A blocked hop
        // throws, which counts as a failed attempt below.
        const { res } = await guardedFetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Zenith-Signature": signature,
          },
          body,
          // A slow/hanging receiver must not tie up the delivery (#285); the
          // callers run this via ctx.waitUntil, but bound each attempt too.
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`receiver returned ${res.status}`);
      };
      // Re-check at delivery time too — the create-time check alone is
      // not durable against rows written by other means (#346).
      //
      // Recorded rather than skipped. A bare `return` left last_status and
      // last_attempt_at untouched, so a webhook whose host became forbidden
      // showed as healthy in Settings forever while delivering nothing —
      // the exact "a dead receiver looked healthy" failure #346 set out to
      // fix, reachable through a different door. It gets its own status
      // because it is not a receiver problem and retrying will not help.
      if (isForbiddenUrl(new URL(hook.url))) {
        await env.DB.prepare(
          `UPDATE webhooks SET last_status = 'blocked', last_attempt_at = datetime('now'), enabled = 0 WHERE id = ?`,
        )
          .bind(hook.id)
          .run();
        return;
      }
      let ok = false;
      try {
        await attempt();
        ok = true;
      } catch {
        // one retry — transient receiver blips shouldn't count as outages
        try {
          await attempt();
          ok = true;
        } catch {
          ok = false;
        }
      }
      // Deliveries were previously fire-and-forget with an empty catch, so
      // a dead receiver looked healthy in Settings forever (#346). Track
      // the outcome; auto-disable after enough consecutive failures.
      if (ok) {
        await env.DB.prepare(
          `UPDATE webhooks SET last_status = 'ok', last_attempt_at = datetime('now'), failure_count = 0 WHERE id = ?`,
        )
          .bind(hook.id)
          .run();
      } else {
        // Incremented in SQL, not from the value read with the row. Two
        // deliveries failing at once both read the same failure_count and
        // both wrote back the same number, so a burst of five counted as
        // one — measured — and the auto-disable that protects a dead
        // receiver was computed from that same stale figure. Webhook events
        // arrive in exactly those bursts: a batch status push, several
        // follow-ups cleared at once.
        await env.DB.prepare(
          `UPDATE webhooks
             SET last_status = 'failed',
                 last_attempt_at = datetime('now'),
                 failure_count = failure_count + 1,
                 enabled = CASE WHEN failure_count + 1 >= ${WEBHOOK_DISABLE_AFTER} THEN 0 ELSE enabled END
           WHERE id = ?`,
        )
          .bind(hook.id)
          .run();
      }
    }),
  );
}

const applicationColumns =
  "id, company_id, title, role_type, url, source, status, notes, applied_at, next_action, next_action_at, deadline_at, fit_score, created_at, updated_at";


// RFC 9457 problem details, for the v1 surface only. The `{error: "..."}`
// shape stays on /api/webhooks and the rest of /api/*: those are the app's
// own endpoints, session-authed, and src/api.ts reads `body.error` from
// them. Changing both at once would have broken the product to tidy its
// public API.
//
// Five fields, and `type` is the one that earns its keep: a URI a client can
// branch on, stable across wording changes, where matching on a human
// sentence is not. They are relative URIs deliberately — the spec allows it,
// and an absolute one would bake this deployment's hostname into every error
// body a self-hosted instance emits.
type ProblemKind =
  | "missing-token"
  | "invalid-token"
  | "not-found"
  | "invalid-request";

const PROBLEM_TITLES: Record<ProblemKind, string> = {
  "missing-token": "Missing bearer token",
  "invalid-token": "Invalid API key",
  "not-found": "Not found",
  "invalid-request": "Invalid request",
};

function problem(
  c: Context<{ Bindings: Env; Variables: { apiUserId: string } }>,
  kind: ProblemKind,
  status: 400 | 401 | 404,
  detail: string,
  headers: Record<string, string> = {},
) {
  return c.json(
    {
      type: `/problems/${kind}`,
      title: PROBLEM_TITLES[kind],
      status,
      detail,
      instance: new URL(c.req.url).pathname,
    },
    status,
    // The media type is half the point: it is what tells a generic client
    // this body is a problem document rather than the resource it asked for.
    { "Content-Type": "application/problem+json", ...headers },
  );
}

export function registerPublicApiRoutes(app: Hono<AppEnv>) {
  const api = new Hono<{ Bindings: Env; Variables: { apiUserId: string } }>();

  // RFC 9110 15.5.2 makes WWW-Authenticate mandatory on a 401 — "MUST send
  // a WWW-Authenticate header field containing at least one challenge" — and
  // both 401s here sent none. It is not decoration: a client that does not
  // know the scheme cannot retry correctly, and generated SDKs and tools
  // (curl --anyauth, Postman, most HTTP middlewares) read the challenge to
  // decide what to do next. Adding a header breaks no existing consumer.
  //
  // RFC 6750 3.1 distinguishes the two cases, and the distinction is the
  // useful part: no credentials is a bare challenge, because the client may
  // simply not have tried yet; a token that was presented and rejected gets
  // error="invalid_token", which says "do not just retry the same key".
  const CHALLENGE = 'Bearer realm="Zenith API"';
  api.use("*", async (c, next) => {
    const auth = c.req.header("Authorization");
    const key = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!key)
      return problem(c, "missing-token", 401, "This endpoint requires a Bearer API key.", {
        "WWW-Authenticate": CHALLENGE,
      });
    const profile = await c.env.DB.prepare(
      "SELECT user_id FROM profile WHERE api_key_hash = ?",
    )
      .bind(await sha256Hex(key))
      .first<{ user_id: string }>();
    if (!profile)
      return problem(c, "invalid-token", 401, "The API key is not valid.", {
        "WWW-Authenticate": `${CHALLENGE}, error="invalid_token", error_description="The API key is not valid"`,
      });
    c.set("apiUserId", profile.user_id);
    await next();
  });

  // 20 by default and 100 at most, replacing 50/200. The old bounds were
  // borrowed from the in-app feed, where the client is this app and knows
  // what it asked for; an integration is a stranger, and the widely-followed
  // figures are the ones a stranger will expect.
  //
  // Still limit/offset rather than a cursor. A cursor is the right answer
  // when rows are inserted between pages and offsets slide — at roughly
  // fifty applications per account, ordered by updated_at, that is a real
  // but small effect, and a cursor would be a larger change than the problem
  // justifies. What was actually missing is stated below.
  const DEFAULT_LIMIT = 20;
  const MAX_LIMIT = 100;

  api.get("/applications", async (c) => {
    const url = new URL(c.req.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const userId = c.get("apiUserId");
    const total = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM applications WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ n: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT ${applicationColumns} FROM applications WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(userId, limit, offset)
      .all();

    // The gap this closes: a client had no way to know whether it had seen
    // everything except by requesting until a page came back short — which
    // costs one extra round trip every time, and is ambiguous on a boundary
    // where the last page is exactly `limit` long.
    //
    // Headers rather than an envelope. Wrapping the array in {data, meta}
    // would break every existing consumer, and this release already changes
    // the error bodies; one breaking change at a time. RFC 8288 Link is the
    // standard shape for this and clients that ignore it are unaffected.
    const count = total?.n ?? 0;
    const links: string[] = [];
    const page = (o: number) => {
      const next = new URL(c.req.url);
      next.searchParams.set("limit", String(limit));
      next.searchParams.set("offset", String(o));
      return `<${next.pathname}${next.search}>`;
    };
    if (offset + limit < count) links.push(`${page(offset + limit)}; rel="next"`);
    if (offset > 0) links.push(`${page(Math.max(0, offset - limit))}; rel="prev"`);
    links.push(`${page(0)}; rel="first"`);

    return c.json(results, 200, {
      "X-Total-Count": String(count),
      Link: links.join(", "),
    });
  });

  api.get("/applications/:id", async (c) => {
    const result = await c.env.DB.prepare(
      `SELECT ${applicationColumns} FROM applications WHERE id = ? AND user_id = ?`,
    )
      .bind(c.req.param("id"), c.get("apiUserId"))
      .first();
    if (!result)
      return problem(c, "not-found", 404, "No application with that id.");
    return c.json(result);
  });

  // Create an application from a saved posting (#477) — the write path the
  // browser extension uses. Deliberately narrow: title + optional company
  // name (find-or-created), url and source only. No compensation is ever
  // accepted here, keeping the key's comp-free contract intact.
  api.post("/applications", async (c) => {
    const body = await c.req.json<{
      title?: string;
      company?: string;
      url?: string;
      source?: string;
    }>();
    const title = (body.title ?? "").trim();
    if (!title)
      return problem(c, "invalid-request", 400, "A non-empty title is required.");
    const userId = c.get("apiUserId");

    let companyId: number | null = null;
    const companyName = (body.company ?? "").trim();
    if (companyName) {
      const existing = await c.env.DB.prepare(
        "SELECT id FROM companies WHERE user_id = ? AND name = ?",
      )
        .bind(userId, companyName)
        .first<{ id: number }>();
      companyId =
        existing?.id ??
        (
          await c.env.DB.prepare(
            "INSERT INTO companies (user_id, name) VALUES (?, ?) RETURNING id",
          )
            .bind(userId, companyName)
            .first<{ id: number }>()
        )?.id ??
        null;
    }

    const url = (body.url ?? "").trim() || null;
    const source = ((body.source ?? "extension") || "extension").slice(0, 60);
    const result = await c.env.DB.prepare(
      `INSERT INTO applications (user_id, company_id, title, role_type, url, source, status)
       VALUES (?, ?, ?, 'other', ?, ?, 'interested')
       RETURNING id, title, company_id, url, source, status, created_at`,
    )
      .bind(userId, companyId, title, url, source)
      .first();
    return c.json(result, 201);
  });

  // Contact basics for the extension's application autofill (#478). Only the
  // fields an application form asks for — never the summary, and never comp.
  api.get("/profile", async (c) => {
    const p = await c.env.DB.prepare(
      "SELECT name, email, phone, location, linkedin, github, portfolio FROM profile WHERE user_id = ?",
    )
      .bind(c.get("apiUserId"))
      .first();
    return c.json(p ?? {});
  });

  app.route("/api/v1", api);
}
