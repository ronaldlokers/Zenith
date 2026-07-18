import { guardedFetch, isForbiddenUrl } from "./url-guard.js";
import { Hono } from "hono";
import type { Context } from "hono";
import { refreshFeed, registerFeedRoutes } from "./feed.js";
import { registerRoleTypeRoutes } from "./role-types.js";
import { checkStalePostings } from "./posting-check.js";
import { registerCvRoutes } from "./cv.js";
import { getAuth } from "./auth.js";
import { resetDemoData, seedSampleData, wipeUserData } from "./demo.js";
import { generateNotifications, registerNotificationRoutes } from "./notifications.js";
import { registerCalendarRoutes } from "./calendar.js";
import { registerPushRoutes } from "./push.js";
import { registerApiKeyRoutes, registerPublicApiRoutes, triggerWebhooks } from "./public-api.js";

export type AppEnv = {
  Bindings: Env;
  Variables: { userId: string; userRole: string | null };
};

const app = new Hono<AppEnv>();

// Shared application write shape (#285) — the INSERT column list, the
// UPDATE SET clause, and the bound values all derive from this one ordered
// list, so POST and PUT can't drift out of sync. Column names are constants
// (not user input), safe to interpolate.
const APP_COLUMNS = [
  "company_id", "contact_id", "title", "role_type", "url", "source",
  "salary_range", "status", "notes", "applied_at", "next_action",
  "next_action_at", "deadline_at", "fit_score", "cover_letter",
  "salary_currency", "salary_min", "salary_max", "salary_period",
  "signing_bonus", "bonus_target_pct", "equity_value", "benefits_notes",
  "referred_by_contact_id", "job_description", "job_description_captured_at",
] as const;

// The bound values in APP_COLUMNS order. Keep this in lockstep with the list.
function applicationValues(
  body: Record<string, unknown>,
  jobDescription: unknown,
  jobDescriptionCapturedAt: unknown,
): unknown[] {
  return [
    body.company_id ?? null,
    body.contact_id ?? null,
    body.title,
    body.role_type ?? "other",
    body.url ?? null,
    body.source ?? null,
    body.salary_range ?? null,
    body.status ?? "interested",
    body.notes ?? null,
    body.applied_at ?? null,
    body.next_action ?? null,
    body.next_action_at ?? null,
    body.deadline_at ?? null,
    body.fit_score ?? null,
    body.cover_letter ?? null,
    body.salary_currency ?? null,
    body.salary_min ?? null,
    body.salary_max ?? null,
    body.salary_period ?? null,
    body.signing_bonus ?? null,
    body.bonus_target_pct ?? null,
    body.equity_value ?? null,
    body.benefits_notes ?? null,
    body.referred_by_contact_id ?? null,
    jobDescription ?? null,
    jobDescriptionCapturedAt ?? null,
  ];
}

// Records a pipeline status change once: the status_history row plus the
// (non-blocking) webhook. Shared by PUT and PATCH so the two can't diverge.
function recordStatusChange(
  c: Context<AppEnv>,
  id: string,
  from: string | null,
  to: string,
): Promise<void> {
  const userId = c.get("userId");
  c.executionCtx.waitUntil(
    triggerWebhooks(c.env, userId, "application.status_changed", {
      application_id: Number(id),
      from_status: from,
      to_status: to,
    }),
  );
  return c.env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, userId, from, to)
    .run()
    .then(() => undefined);
}

// Account creation is invite-only/admin-created (#38): the public
// self-signup route is blocked here before it reaches Better-Auth's
// handler. New accounts (including the demo account) are created by an
// existing admin via the admin plugin's /api/auth/admin/create-user
// endpoint, which already requires an authenticated admin session.
app.post("/api/auth/sign-up/email", (c) => c.json({ error: "sign-up is invite-only" }, 403));

app.on(["POST", "GET"], "/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

// The public read-only API (#228) is Bearer-key authenticated, not
// session-cookie authenticated — it has to be registered (and matched)
// before the blanket /api/* session-check middleware below, the same
// way /api/auth/* is, otherwise every external API call would 401
// before ever reaching public-api.ts's own auth check.
registerPublicApiRoutes(app);

// Every other /api route requires a valid session. The public share link
// (/shared/:token, #113) intentionally stays outside /api and outside this
// check — it's gated by its own unguessable token instead.
app.use("/api/*", async (c, next) => {
  const session = await getAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.user.id);
  c.set("userRole", (session.user as { role?: string | null }).role ?? null);
  await next();
});

// Admin-only routes (demo data reset). The admin plugin's own endpoints
// (e.g. /api/auth/admin/create-user) enforce this themselves — this
// middleware is only for the custom /api/admin/* routes below.
app.use("/api/admin/*", async (c, next) => {
  if (c.get("userRole") !== "admin") return c.json({ error: "forbidden" }, 403);
  await next();
});

// --- Companies ---

app.get("/api/companies", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM companies WHERE user_id = ? ORDER BY name",
  )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

app.post("/api/companies", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO companies (user_id, name, website, location, is_agency, notes)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      c.get("userId"),
      body.name,
      body.website ?? null,
      body.location ?? null,
      body.is_agency ? 1 : 0,
      body.notes ?? null,
    )
    .first();
  return c.json(result, 201);
});

app.put("/api/companies/:id", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE companies SET name = ?, website = ?, location = ?, is_agency = ?, notes = ?
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(
      body.name,
      body.website ?? null,
      body.location ?? null,
      body.is_agency ? 1 : 0,
      body.notes ?? null,
      c.req.param("id"),
      c.get("userId"),
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.delete("/api/companies/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM companies WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.body(null, 204);
});

app.post("/api/companies/:id/research", async (c) => {
  const company = await c.env.DB.prepare(
    "SELECT id, website FROM companies WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), c.get("userId"))
    .first<{ id: number; website: string | null }>();
  if (!company) return c.json({ error: "not found" }, 404);
  if (!company.website) {
    return c.json({ error: "add a website first" }, 400);
  }

  let url: URL;
  try {
    url = new URL(company.website);
  } catch {
    return c.json({ error: "invalid website url" }, 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return c.json({ error: "only http(s) urls are supported" }, 400);
  }
  if (isForbiddenUrl(url)) {
    return c.json({ error: "url points at a forbidden host" }, 400);
  }

  let html: string;
  try {
    const { res } = await guardedFetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return c.json({ error: `site returned ${res.status}` }, 502);
    }
    html = (await res.text()).slice(0, 2_000_000);
  } catch {
    return c.json({ error: "could not fetch site" }, 502);
  }

  const description = metaContent(html, "og:description");
  let logo = metaContent(html, "og:image");
  if (logo) {
    try {
      logo = new URL(logo, url).toString();
    } catch {
      logo = null;
    }
  }

  const result = await c.env.DB.prepare(
    `UPDATE companies SET description = ?, logo_url = ?, researched_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(description, logo, company.id, c.get("userId"))
    .first();
  return c.json(result);
});

// --- Contacts ---

app.get("/api/contacts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT contacts.*, companies.name AS company_name
     FROM contacts LEFT JOIN companies ON companies.id = contacts.company_id
     WHERE contacts.user_id = ?
     ORDER BY contacts.name`,
  )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

app.post("/api/contacts", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO contacts (user_id, company_id, name, role, email, phone, linkedin, notes, last_contacted_at, follow_up_at, outreach_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      c.get("userId"),
      body.company_id ?? null,
      body.name,
      body.role ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.linkedin ?? null,
      body.notes ?? null,
      body.last_contacted_at ?? null,
      body.follow_up_at ?? null,
      body.outreach_status ?? "not_contacted",
    )
    .first();
  return c.json(result, 201);
});

app.put("/api/contacts/:id", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE contacts SET company_id = ?, name = ?, role = ?, email = ?, phone = ?, linkedin = ?, notes = ?,
       last_contacted_at = ?, follow_up_at = ?, outreach_status = ?
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(
      body.company_id ?? null,
      body.name,
      body.role ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.linkedin ?? null,
      body.notes ?? null,
      body.last_contacted_at ?? null,
      body.follow_up_at ?? null,
      body.outreach_status ?? "not_contacted",
      c.req.param("id"),
      c.get("userId"),
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.delete("/api/contacts/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM contacts WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.body(null, 204);
});

// --- Applications ---

app.get("/api/applications", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT applications.*, companies.name AS company_name, contacts.name AS contact_name,
            referrer.name AS referred_by_name
     FROM applications
     LEFT JOIN companies ON companies.id = applications.company_id
     LEFT JOIN contacts ON contacts.id = applications.contact_id
     LEFT JOIN contacts AS referrer ON referrer.id = applications.referred_by_contact_id
     WHERE applications.user_id = ?
     ORDER BY applications.updated_at DESC`,
  )
    .bind(c.get("userId"))
    .all<{ id: number }>();
  const { results: tagLinks } = await c.env.DB.prepare(
    `SELECT application_tags.application_id, tags.id, tags.name
     FROM application_tags
     JOIN tags ON tags.id = application_tags.tag_id
     WHERE application_tags.user_id = ?
     ORDER BY application_tags.sort_order, application_tags.tag_id`,
  )
    .bind(c.get("userId"))
    .all<{ application_id: number; id: number; name: string }>();
  const withTags = results.map((a) => ({
    ...a,
    tags: tagLinks
      .filter((l) => l.application_id === a.id)
      .map((l) => ({ id: l.id, name: l.name })),
  }));
  return c.json(withTags);
});

// --- Tags ---

app.get("/api/tags", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM tags WHERE user_id = ? ORDER BY name",
  )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

// Saved views (#277) — named Jobs-filter snapshots. `filters` is stored as
// a JSON string and returned parsed so the client works with an object.
app.get("/api/saved-views", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, filters, created_at FROM saved_views WHERE user_id = ? ORDER BY created_at",
  )
    .bind(c.get("userId"))
    .all<{ id: number; name: string; filters: string; created_at: string }>();
  return c.json(
    results.map((r) => ({ ...r, filters: JSON.parse(r.filters) })),
  );
});

app.post("/api/saved-views", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ error: "name is required" }, 400);
  if (body.filters == null || typeof body.filters !== "object") {
    return c.json({ error: "filters is required" }, 400);
  }
  const row = await c.env.DB.prepare(
    "INSERT INTO saved_views (user_id, name, filters) VALUES (?, ?, ?) RETURNING id, name, filters, created_at",
  )
    .bind(c.get("userId"), name, JSON.stringify(body.filters))
    .first<{ id: number; name: string; filters: string; created_at: string }>();
  return c.json({ ...row!, filters: JSON.parse(row!.filters) }, 201);
});

app.delete("/api/saved-views/:id", async (c) => {
  const res = await c.env.DB.prepare(
    "DELETE FROM saved_views WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  if (res.meta.changes === 0) return c.json({ error: "not found" }, 404);
  return c.body(null, 204);
});

app.post("/api/applications/:id/tags", async (c) => {
  const body = await c.req.json();
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ error: "name is required" }, 400);
  const userId = c.get("userId");

  const application = await c.env.DB.prepare(
    "SELECT id FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), userId)
    .first();
  if (!application) return c.json({ error: "not found" }, 404);

  let tag = await c.env.DB.prepare(
    "SELECT * FROM tags WHERE name = ? COLLATE NOCASE AND user_id = ?",
  )
    .bind(name, userId)
    .first<{ id: number; name: string }>();
  if (!tag) {
    tag = await c.env.DB.prepare(
      "INSERT INTO tags (user_id, name) VALUES (?, ?) RETURNING *",
    )
      .bind(userId, name)
      .first<{ id: number; name: string }>();
  }
  const { next_order } =
    (await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM application_tags WHERE application_id = ? AND user_id = ?`,
    )
      .bind(c.req.param("id"), userId)
      .first<{ next_order: number }>()) ?? { next_order: 0 };
  await c.env.DB.prepare(
    `INSERT INTO application_tags (application_id, tag_id, user_id, sort_order)
     VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  )
    .bind(c.req.param("id"), tag!.id, userId, next_order)
    .run();
  return c.json(tag, 201);
});

app.patch("/api/applications/:id/tags/:tagId", async (c) => {
  const body = await c.req.json();
  if (typeof body.sort_order !== "number") {
    return c.json({ error: "sort_order is required" }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE application_tags SET sort_order = ?
     WHERE application_id = ? AND tag_id = ? AND user_id = ?`,
  )
    .bind(body.sort_order, c.req.param("id"), c.req.param("tagId"), c.get("userId"))
    .run();
  return c.body(null, 204);
});

app.delete("/api/applications/:id/tags/:tagId", async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM application_tags WHERE application_id = ? AND tag_id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), c.req.param("tagId"), c.get("userId"))
    .run();
  return c.body(null, 204);
});

// --- Interview prep checklist ---

app.get("/api/applications/:id/prep-items", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM interview_prep_items WHERE application_id = ? AND user_id = ? ORDER BY sort_order, id",
  )
    .bind(c.req.param("id"), c.get("userId"))
    .all();
  return c.json(results);
});

app.post("/api/applications/:id/prep-items", async (c) => {
  const body = await c.req.json();
  const text = (body.text ?? "").trim();
  if (!text) return c.json({ error: "text is required" }, 400);
  const userId = c.get("userId");

  const application = await c.env.DB.prepare(
    "SELECT id FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), userId)
    .first();
  if (!application) return c.json({ error: "not found" }, 404);

  const maxOrder = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) AS m FROM interview_prep_items WHERE application_id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ m: number }>();
  const result = await c.env.DB.prepare(
    `INSERT INTO interview_prep_items (application_id, user_id, text, sort_order)
     VALUES (?, ?, ?, ?) RETURNING *`,
  )
    .bind(c.req.param("id"), userId, text, (maxOrder?.m ?? -1) + 1)
    .first();
  return c.json(result, 201);
});

app.put("/api/prep-items/:id", async (c) => {
  const body = await c.req.json();
  const result = await c.env.DB.prepare(
    "UPDATE interview_prep_items SET text = COALESCE(?, text), done = COALESCE(?, done) WHERE id = ? AND user_id = ? RETURNING *",
  )
    .bind(
      body.text ?? null,
      body.done != null ? (body.done ? 1 : 0) : null,
      c.req.param("id"),
      c.get("userId"),
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.delete("/api/prep-items/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM interview_prep_items WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.body(null, 204);
});

// --- Wins journal (#225) ---

app.get("/api/journal-entries", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM journal_entries WHERE user_id = ? ORDER BY created_at DESC, id DESC",
  )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

app.post("/api/journal-entries", async (c) => {
  const body = await c.req.json();
  const text = (body.text ?? "").trim();
  if (!text) return c.json({ error: "text is required" }, 400);
  const result = await c.env.DB.prepare(
    "INSERT INTO journal_entries (user_id, text) VALUES (?, ?) RETURNING *",
  )
    .bind(c.get("userId"), text)
    .first();
  return c.json(result, 201);
});

app.delete("/api/journal-entries/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM journal_entries WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.body(null, 204);
});

app.post("/api/applications", async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const userId = c.get("userId");
  const jobDescription = body.job_description ?? null;
  const cols = ["user_id", ...APP_COLUMNS];
  const result = await c.env.DB.prepare(
    `INSERT INTO applications (${cols.join(", ")})
     VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`,
  )
    .bind(
      userId,
      ...applicationValues(
        body,
        jobDescription,
        jobDescription ? new Date().toISOString() : null,
      ),
    )
    .first();
  await c.env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES (?, ?, NULL, ?)`,
  )
    .bind((result as { id: number }).id, userId, (result as { status: string }).status)
    .run();
  return c.json(result, 201);
});

app.post("/api/applications/:id/archive", async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE applications SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.post("/api/applications/:id/unarchive", async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE applications SET archived_at = NULL, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.put("/api/applications/:id", async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const userId = c.get("userId");
  const existing = await c.env.DB.prepare(
    "SELECT status, job_description, job_description_captured_at FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), userId)
    .first<{
      status: string;
      job_description: string | null;
      job_description_captured_at: string | null;
    }>();
  if (!existing) return c.json({ error: "not found" }, 404);
  // A snapshot is captured once, the first time job_description goes
  // from empty to non-empty — later edits to the text don't re-stamp
  // the capture date, since the point is recording what was applied to.
  const jobDescription = body.job_description ?? existing.job_description;
  const jobDescriptionCapturedAt =
    existing.job_description_captured_at ??
    (jobDescription ? new Date().toISOString() : null);
  const result = await c.env.DB.prepare(
    `UPDATE applications
     SET ${APP_COLUMNS.map((col) => `${col} = ?`).join(", ")},
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(
      ...applicationValues(body, jobDescription, jobDescriptionCapturedAt),
      c.req.param("id"),
      userId,
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  const newStatus = (result as { status: string }).status;
  if (newStatus !== existing.status) {
    await recordStatusChange(c, c.req.param("id"), existing.status, newStatus);
  }
  return c.json(result);
});

app.patch("/api/applications/:id/status", async (c) => {
  const body = await c.req.json();
  if (!body.status) return c.json({ error: "status is required" }, 400);
  const userId = c.get("userId");
  const existing = await c.env.DB.prepare(
    "SELECT status FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), userId)
    .first<{ status: string }>();
  if (!existing) return c.json({ error: "not found" }, 404);
  // A stage change completes whatever follow-up was pending for the old
  // stage, so clear it — otherwise the old next_action_at lingers and the
  // job reads as overdue forever until hand-edited (#285). The full edit
  // form (PUT) submits next_action explicitly, so it isn't touched here.
  const statusChanged = body.status !== existing.status;
  const result = await c.env.DB.prepare(
    statusChanged
      ? `UPDATE applications
           SET status = ?, next_action = NULL, next_action_at = NULL, updated_at = datetime('now')
         WHERE id = ? AND user_id = ? RETURNING *`
      : `UPDATE applications SET status = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(body.status, c.req.param("id"), userId)
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  if (statusChanged) {
    await recordStatusChange(c, c.req.param("id"), existing.status, body.status);
  }
  return c.json(result);
});

app.delete("/api/applications/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM applications WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.body(null, 204);
});

// Lightweight follow-up update (#285) — lets the Next Up panel complete
// ("done" → clear) or snooze a follow-up inline, without opening the whole
// edit form. Only touches next_action / next_action_at.
app.patch("/api/applications/:id/follow-up", async (c) => {
  const body = await c.req.json();
  const result = await c.env.DB.prepare(
    `UPDATE applications
       SET next_action = ?, next_action_at = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(
      body.next_action ?? null,
      body.next_action_at ?? null,
      c.req.param("id"),
      c.get("userId"),
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

// Inline field edits (#314 round 3) — the job page edits notes and fit
// score in place; only these two columns are patchable here. Everything
// else still goes through the full PUT.
app.patch("/api/applications/:id", async (c) => {
  const body = await c.req.json();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if ("notes" in body) {
    sets.push("notes = ?");
    vals.push(body.notes ?? null);
  }
  if ("fit_score" in body) {
    const fit = body.fit_score;
    if (fit != null && !(Number.isInteger(fit) && fit >= 1 && fit <= 5)) {
      return c.json({ error: "fit_score must be 1-5 or null" }, 400);
    }
    sets.push("fit_score = ?");
    vals.push(fit ?? null);
  }
  if (!sets.length) return c.json({ error: "nothing to update" }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE applications
       SET ${sets.join(", ")}, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(...vals, c.req.param("id"), c.get("userId"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

// --- Interactions ---

app.get("/api/applications/:id/interactions", async (c) => {
  // Includes interactions logged directly on the application's linked
  // contact, flagged via_contact so the UI can mark them.
  const { results } = await c.env.DB.prepare(
    `SELECT i.*, CASE WHEN i.application_id IS NULL THEN 1 ELSE 0 END AS via_contact
     FROM interactions i
     WHERE i.user_id = ?2
       AND (i.application_id = ?1
        OR (i.application_id IS NULL
            AND i.contact_id = (SELECT contact_id FROM applications WHERE id = ?1 AND user_id = ?2)))
     ORDER BY i.happened_at DESC, i.id DESC`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .all();
  return c.json(results);
});

app.post("/api/applications/:id/interactions", async (c) => {
  const body = await c.req.json();
  const userId = c.get("userId");
  const application = await c.env.DB.prepare(
    "SELECT id FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), userId)
    .first();
  if (!application) return c.json({ error: "not found" }, 404);
  const result = await c.env.DB.prepare(
    `INSERT INTO interactions (application_id, user_id, type, happened_at, notes, interviewers)
     VALUES (?, ?, ?, coalesce(?, date('now')), ?, ?) RETURNING *`,
  )
    .bind(
      c.req.param("id"),
      userId,
      body.type ?? "other",
      body.happened_at ?? null,
      body.notes ?? null,
      body.interviewers ?? null,
    )
    .first();
  return c.json(result, 201);
});

app.get("/api/contacts/:id/interactions", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.*, 0 AS via_contact FROM interactions i WHERE i.contact_id = ? AND i.user_id = ?
     ORDER BY i.happened_at DESC, i.id DESC`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .all();
  return c.json(results);
});

app.post("/api/contacts/:id/interactions", async (c) => {
  const body = await c.req.json();
  const userId = c.get("userId");
  const contact = await c.env.DB.prepare(
    "SELECT id FROM contacts WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), userId)
    .first();
  if (!contact) return c.json({ error: "not found" }, 404);
  const result = await c.env.DB.prepare(
    `INSERT INTO interactions (contact_id, user_id, type, happened_at, notes, interviewers)
     VALUES (?, ?, ?, coalesce(?, date('now')), ?, ?) RETURNING *`,
  )
    .bind(
      c.req.param("id"),
      userId,
      body.type ?? "other",
      body.happened_at ?? null,
      body.notes ?? null,
      body.interviewers ?? null,
    )
    .first();
  return c.json(result, 201);
});

app.delete("/api/interactions/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM interactions WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.body(null, 204);
});

// --- Export ---

const EXPORT_TABLES = [
  "companies",
  "contacts",
  "applications",
  "interactions",
  "status_history",
  "documents",
  "application_tags",
  "tags",
  "profile",
  "skills",
  "work_experience",
  "work_experience_skills",
  "education",
  "languages",
  "interview_prep_items",
  "role_types",
  "feed_sources",
  "feed_role_keywords",
  "feed_items",
  "feed_item_status",
] as const;

// feed_items is a shared pool (no user_id — see migration 0024), so it's
// exported as-is rather than scoped to one user.
const GLOBAL_EXPORT_TABLES = new Set(["feed_items"]);

export async function buildFullExport(
  env: Env,
): Promise<Record<string, unknown>> {
  const dump: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
    dump[table] = results;
  }
  return { exported_at: new Date().toISOString(), ...dump };
}

async function buildUserExport(
  env: Env,
  userId: string,
): Promise<Record<string, unknown>> {
  const dump: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const { results } = GLOBAL_EXPORT_TABLES.has(table)
      ? await env.DB.prepare(`SELECT * FROM ${table}`).all()
      : await env.DB.prepare(`SELECT * FROM ${table} WHERE user_id = ?`)
          .bind(userId)
          .all();
    dump[table] = results;
  }
  return { exported_at: new Date().toISOString(), ...dump };
}

app.get("/api/export", async (c) => {
  const dump = await buildUserExport(c.env, c.get("userId"));
  return c.json(dump, 200, {
    "Content-Disposition": `attachment; filename="jobseekr-export-${new Date().toISOString().slice(0, 10)}.json"`,
  });
});

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Formula-injection guard (#346): titles/notes/company names can come
    // from scraped postings or external feed boards, and a leading = + - @
    // (or tab/CR) opens as a live formula in Excel/Sheets. The leading
    // apostrophe is the spreadsheet-standard "treat as text" escape.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((col) => escape(r[col])).join(",")),
  ].join("\n");
}

app.get("/api/export/:table", async (c) => {
  const table = c.req.param("table").replace(/\.csv$/, "");
  if (!(EXPORT_TABLES as readonly string[]).includes(table)) {
    return c.json({ error: "unknown table" }, 404);
  }
  const { results } = GLOBAL_EXPORT_TABLES.has(table)
    ? await c.env.DB.prepare(`SELECT * FROM ${table}`).all()
    : await c.env.DB.prepare(`SELECT * FROM ${table} WHERE user_id = ?`)
        .bind(c.get("userId"))
        .all();
  return c.body(toCsv(results as Record<string, unknown>[]), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="jobseekr-${table}.csv"`,
  });
});

// --- Import job posting from URL (best effort) ---

interface ImportResult {
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  source: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}

function metaContent(html: string, key: string): string | null {
  // Matches <meta property="og:x" content="..."> in either attribute order
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

function findJobPosting(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findJobPosting(item);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
    return obj;
  }
  if (obj["@graph"]) return findJobPosting(obj["@graph"]);
  return null;
}

app.get("/api/import", async (c) => {
  const raw = c.req.query("url");
  if (!raw) return c.json({ error: "url query param is required" }, 400);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return c.json({ error: "invalid url" }, 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return c.json({ error: "only http(s) urls are supported" }, 400);
  }
  if (isForbiddenUrl(url)) {
    return c.json({ error: "url points at a forbidden host" }, 400);
  }

  let html: string;
  try {
    const { res } = await guardedFetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return c.json(
        { error: `page returned ${res.status} — fill in manually` },
        502,
      );
    }
    html = (await res.text()).slice(0, 2_000_000);
  } catch {
    return c.json({ error: "could not fetch page — fill in manually" }, 502);
  }

  const result: ImportResult = {
    title: null,
    company: null,
    location: null,
    salary: null,
    source: url.hostname.replace(/^www\./, ""),
  };

  // JSON-LD JobPosting is the richest source
  const ldBlocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of ldBlocks) {
    try {
      const posting = findJobPosting(JSON.parse(m[1]));
      if (!posting) continue;
      result.title = (posting.title as string) ?? null;
      const org = posting.hiringOrganization as
        | { name?: string }
        | string
        | undefined;
      result.company =
        typeof org === "string" ? org : (org?.name ?? null);
      const loc = posting.jobLocation as
        | { address?: { addressLocality?: string } }
        | Array<{ address?: { addressLocality?: string } }>
        | undefined;
      const addr = Array.isArray(loc) ? loc[0]?.address : loc?.address;
      result.location = addr?.addressLocality ?? null;
      const salary = posting.baseSalary as
        | { value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string }; currency?: string }
        | undefined;
      if (salary?.value) {
        const v = salary.value;
        const cur = salary.currency ?? "";
        result.salary = v.minValue
          ? `${cur} ${v.minValue}–${v.maxValue ?? v.minValue} ${v.unitText ?? ""}`.trim()
          : v.value
            ? `${cur} ${v.value} ${v.unitText ?? ""}`.trim()
            : null;
      }
      break;
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }

  // OpenGraph / title fallbacks
  if (!result.title) {
    result.title =
      metaContent(html, "og:title") ??
      (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
        ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1])
        : null);
  }
  if (!result.company) {
    result.company = metaContent(html, "og:site_name");
  }

  return c.json(result);
});

// --- Agenda ---
// Combines three date-bearing signals already in the schema into one
// read-only feed: no separate "scheduled interview" concept needed —
// an interaction logged with a future happened_at (nothing stops you
// entering one today) doubles as a scheduled event.

app.get("/api/agenda", async (c) => {
  const userId = c.get("userId");
  const [dueRes, interactionsRes, appliedRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT applications.id, applications.title, applications.next_action AS label,
              applications.next_action_at AS date, companies.name AS company_name
       FROM applications
       LEFT JOIN companies ON companies.id = applications.company_id
       WHERE applications.user_id = ?
         AND applications.next_action_at IS NOT NULL
         AND applications.status NOT IN ('rejected', 'withdrawn', 'ghosted')`,
    )
      .bind(userId)
      .all(),
    c.env.DB.prepare(
      `SELECT interactions.id, interactions.type, interactions.happened_at AS date,
              interactions.notes,
              applications.id AS application_id, applications.title,
              companies.name AS company_name, contacts.name AS contact_name
       FROM interactions
       LEFT JOIN applications ON applications.id = interactions.application_id
       LEFT JOIN companies ON companies.id = applications.company_id
       LEFT JOIN contacts ON contacts.id = COALESCE(interactions.contact_id, applications.contact_id)
       WHERE interactions.user_id = ?
         AND interactions.happened_at >= date('now', '-14 days')`,
    )
      .bind(userId)
      .all(),
    c.env.DB.prepare(
      `SELECT applications.id, applications.title, applications.applied_at AS date,
              companies.name AS company_name
       FROM applications
       LEFT JOIN companies ON companies.id = applications.company_id
       WHERE applications.user_id = ?
         AND applications.applied_at IS NOT NULL`,
    )
      .bind(userId)
      .all(),
  ]);

  const due = dueRes.results.map((r) => ({ kind: "due" as const, ...r }));
  const interactions = interactionsRes.results.map((r) => ({
    kind: "interaction" as const,
    ...r,
  }));
  const applied = appliedRes.results.map((r) => ({
    kind: "applied" as const,
    ...r,
  }));

  return c.json([...due, ...interactions, ...applied]);
});

// --- Activity feed (#129) ---
// A single reverse-chronological feed across every application — status
// changes, interactions, documents attached — distinct from the
// per-application timeline in the detail modal.

const ACTIVITY_LIMIT = 100;

app.get("/api/activity", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare(
    `SELECT 'status' AS kind, sh.application_id, a.title, comp.name AS company_name,
            sh.from_status, sh.to_status, NULL AS type, NULL AS notes, NULL AS filename,
            sh.changed_at AS ts
     FROM status_history sh
     JOIN applications a ON a.id = sh.application_id
     LEFT JOIN companies comp ON comp.id = a.company_id
     WHERE sh.user_id = ?1

     UNION ALL

     SELECT 'interaction', i.application_id, a.title, comp.name,
            NULL, NULL, i.type, i.notes, NULL,
            i.happened_at
     FROM interactions i
     JOIN applications a ON a.id = i.application_id
     LEFT JOIN companies comp ON comp.id = a.company_id
     WHERE i.user_id = ?1 AND i.application_id IS NOT NULL

     UNION ALL

     SELECT 'document', d.application_id, a.title, comp.name,
            NULL, NULL, NULL, NULL, d.filename,
            d.created_at
     FROM documents d
     JOIN applications a ON a.id = d.application_id
     LEFT JOIN companies comp ON comp.id = a.company_id
     WHERE d.user_id = ?1

     ORDER BY ts DESC
     LIMIT ?2`,
  )
    .bind(userId, ACTIVITY_LIMIT)
    .all();
  return c.json(results);
});

// --- Stats ---

app.get("/api/stats", async (c) => {
  const userId = c.get("userId");
  const [apps, history, interactions] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, status, source, applied_at, created_at FROM applications WHERE user_id = ?",
    )
      .bind(userId)
      .all(),
    c.env.DB.prepare(
      `SELECT application_id, from_status, to_status, changed_at
       FROM status_history WHERE user_id = ? ORDER BY application_id, changed_at, id`,
    )
      .bind(userId)
      .all(),
    // Last logged interaction per application — the Pipeline's "gone
    // quiet" badge counts a nudge as activity (#314 round 3), not just
    // stage moves.
    c.env.DB.prepare(
      `SELECT application_id, MAX(happened_at) AS last_at
       FROM interactions WHERE user_id = ? AND application_id IS NOT NULL
       GROUP BY application_id`,
    )
      .bind(userId)
      .all(),
  ]);
  return c.json({
    applications: apps.results,
    history: history.results,
    interactions: interactions.results,
  });
});

// --- Public share link (#113) ---
// A single unauthenticated route (/shared/:token, below) gated by an
// unguessable per-user token, showing aggregate Stats only (no
// per-application detail, no edit capability). It intentionally stays
// outside the /api/* auth requirement — anyone with the token can view it
// by design — and outside /api entirely so it isn't blocked by that
// middleware.

app.post("/api/profile/share-token", async (c) => {
  const token = crypto.randomUUID();
  const userId = c.get("userId");
  await c.env.DB.prepare(
    "INSERT INTO profile (user_id, share_token) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET share_token = excluded.share_token",
  )
    .bind(userId, token)
    .run();
  return c.json({ share_token: token });
});

app.delete("/api/profile/share-token", async (c) => {
  await c.env.DB.prepare("UPDATE profile SET share_token = NULL WHERE user_id = ?")
    .bind(c.get("userId"))
    .run();
  return c.body(null, 204);
});

const SHARE_PIPELINE = ["interested", "applied", "screening", "interview", "offer"];

function shareParseSqlDate(d: string): number {
  return new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z").getTime();
}

app.get("/shared/:token", async (c) => {
  const token = c.req.param("token");
  const profile = await c.env.DB.prepare(
    "SELECT user_id FROM profile WHERE share_token = ?",
  )
    .bind(token)
    .first<{ user_id: string }>();
  if (!profile) return c.text("Not found", 404);

  const [apps, history] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, status, applied_at, created_at FROM applications WHERE user_id = ?",
    )
      .bind(profile.user_id)
      .all<{ id: number; status: string; applied_at: string | null; created_at: string }>(),
    c.env.DB.prepare(
      `SELECT application_id, from_status, to_status, changed_at
       FROM status_history WHERE user_id = ? ORDER BY application_id, changed_at, id`,
    )
      .bind(profile.user_id)
      .all<{
        application_id: number;
        from_status: string | null;
        to_status: string;
        changed_at: string;
      }>(),
  ]);

  const reachedByApp = new Map<number, number>();
  for (const row of history.results) {
    const idx = SHARE_PIPELINE.indexOf(row.to_status);
    if (idx < 0) continue;
    const prev = reachedByApp.get(row.application_id) ?? -1;
    if (idx > prev) reachedByApp.set(row.application_id, idx);
  }
  const funnel = SHARE_PIPELINE.map((stage, i) => ({
    stage,
    count: [...reachedByApp.values()].filter((r) => r >= i).length,
  }));
  const funnelMax = Math.max(1, funnel[0]?.count ?? 0);

  const now = Date.now();
  const PERIOD = 14 * 86400000;
  const isForwardMove = (row: (typeof history.results)[number]) => {
    const toIdx = SHARE_PIPELINE.indexOf(row.to_status);
    const fromIdx = row.from_status ? SHARE_PIPELINE.indexOf(row.from_status) : -1;
    return toIdx >= 0 && toIdx > fromIdx;
  };
  const recentMoves = history.results.filter(
    (h) => isForwardMove(h) && shareParseSqlDate(h.changed_at) >= now - PERIOD,
  ).length;
  const priorMoves = history.results.filter(
    (h) =>
      isForwardMove(h) &&
      shareParseSqlDate(h.changed_at) >= now - 2 * PERIOD &&
      shareParseSqlDate(h.changed_at) < now - PERIOD,
  ).length;
  let momentum = "Steady";
  if (recentMoves === 0 && priorMoves === 0) momentum = "No recent activity";
  else if (priorMoves === 0) momentum = "Speeding up";
  else {
    const change = (recentMoves - priorMoves) / priorMoves;
    momentum = change > 0.15 ? "Speeding up" : change < -0.15 ? "Slowing down" : "Steady";
  }

  const totalOpen = apps.results.filter(
    (a) => !["rejected", "withdrawn", "ghosted"].includes(a.status),
  ).length;

  const rows = funnel
    .map(
      (f) => `
      <div class="row">
        <span class="lbl">${f.stage}</span>
        <span class="track"><span class="fill" style="width:${(f.count / funnelMax) * 100}%"></span></span>
        <span class="n">${f.count}</span>
      </div>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>JobSeekr — shared pipeline</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #101318; color: #e8ebef; margin: 0; padding: 2rem 1.25rem; }
  .wrap { max-width: 32rem; margin: 0 auto; }
  h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 1.5rem; }
  .momentum { padding: 0.9rem 1rem; margin-bottom: 1.5rem; border-radius: 10px; border: 1px solid #232935; background: #171b22; }
  .momentum-label { display:block; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6d7684; }
  .momentum-value { font-size: 1.3rem; font-weight: 700; }
  .open-count { color: #8b95a5; font-size: 0.85rem; margin-bottom: 1.5rem; display: block; }
  .row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; font-size: 0.8rem; }
  .lbl { width: 5.5rem; text-transform: capitalize; color: #8b95a5; }
  .track { flex: 1; height: 8px; background: #262d3a; border-radius: 4px; overflow: hidden; }
  .fill { display: block; height: 100%; background: #2dd4bf; }
  .n { width: 1.5rem; text-align: right; }
  footer { margin-top: 2rem; font-size: 0.72rem; color: #6d7684; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Shared pipeline</h1>
    <div class="momentum">
      <span class="momentum-label">Pipeline momentum</span>
      <span class="momentum-value">${momentum}</span>
    </div>
    <span class="open-count">${totalOpen} open applications</span>
    ${rows}
    <footer>Read-only view — no application details, no editing. Powered by JobSeekr.</footer>
  </div>
</body>
</html>`;

  return c.html(html);
});

// --- Documents (R2) ---

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

app.get("/api/applications/:id/documents", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, application_id, filename, label, size, content_type, created_at
     FROM documents WHERE application_id = ? AND user_id = ? ORDER BY created_at DESC`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .all();
  return c.json(results);
});

app.post("/api/applications/:id/documents", async (c) => {
  const filename = c.req.query("filename");
  if (!filename) return c.json({ error: "filename query param is required" }, 400);
  const size = Number(c.req.header("Content-Length") ?? 0);
  if (!size) return c.json({ error: "empty body" }, 400);
  if (size > MAX_DOCUMENT_BYTES) {
    return c.json({ error: "file too large (max 10 MB)" }, 413);
  }
  const userId = c.get("userId");
  const appId = c.req.param("id");
  const application = await c.env.DB.prepare(
    "SELECT id FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(appId, userId)
    .first();
  if (!application) return c.json({ error: "not found" }, 404);
  const contentType =
    c.req.header("Content-Type") ?? "application/octet-stream";
  const key = `app-${appId}/${Date.now()}-${filename}`;
  await c.env.DOCS.put(key, c.req.raw.body, {
    httpMetadata: { contentType },
  });
  const result = await c.env.DB.prepare(
    `INSERT INTO documents (application_id, user_id, key, filename, label, size, content_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id, application_id, filename, label, size, content_type, created_at`,
  )
    .bind(appId, userId, key, filename, c.req.query("label") ?? null, size, contentType)
    .first();
  return c.json(result, 201);
});

app.get("/api/documents/:id/download", async (c) => {
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .first<{ key: string; filename: string; content_type: string | null }>();
  if (!doc) return c.json({ error: "not found" }, 404);
  const object = await c.env.DOCS.get(doc.key);
  if (!object) return c.json({ error: "file missing from storage" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": doc.content_type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${doc.filename.replace(/"/g, "")}"`,
    },
  });
});

app.delete("/api/documents/:id", async (c) => {
  const doc = await c.env.DB.prepare("SELECT key FROM documents WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.get("userId"))
    .first<{ key: string }>();
  if (doc) {
    await c.env.DOCS.delete(doc.key);
    await c.env.DB.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?")
      .bind(c.req.param("id"), c.get("userId"))
      .run();
  }
  return c.body(null, 204);
});

registerFeedRoutes(app);
registerRoleTypeRoutes(app);
registerCvRoutes(app);
registerNotificationRoutes(app);
registerCalendarRoutes(app);
registerPushRoutes(app);
registerApiKeyRoutes(app);

// Admin-only: wipe and reseed the demo account's data with one example of
// every shipped feature (#38). The demo account itself is created like any
// other invited user via the "Invite a user" form in Settings.
app.post("/api/admin/reset-demo-data", async (c) => {
  const result = await resetDemoData(c.env);
  if (!result.seeded) {
    return c.json({ error: "demo account doesn't exist yet — invite it first" }, 404);
  }
  return c.json(result);
});

// Admin resets a user's 2FA (#285) — the Better Auth admin plugin can reset
// passwords and remove users, but has no built-in to clear another user's
// second factor, so a user who loses their authenticator would otherwise be
// permanently locked out. This drops their TOTP secret + backup codes and
// flips twoFactorEnabled off so they can log in with just their password.
app.post("/api/admin/users/:id/reset-2fa", async (c) => {
  const targetId = c.req.param("id");
  const user = await c.env.DB.prepare('SELECT id FROM "user" WHERE id = ?')
    .bind(targetId)
    .first();
  if (!user) return c.json({ error: "user not found" }, 404);
  await c.env.DB.prepare('DELETE FROM "twoFactor" WHERE "userId" = ?')
    .bind(targetId)
    .run();
  await c.env.DB.prepare('UPDATE "user" SET "twoFactorEnabled" = 0 WHERE id = ?')
    .bind(targetId)
    .run();
  return c.body(null, 204);
});

// Per-user sample data (#281) — a new/invited user can populate their own
// account with the example dataset to explore, then wipe it.
// Whether the account holds ANY user content (#285) — gates sample-data
// loading so a wipe-then-seed can never clobber real applications,
// companies, contacts, a CV, documents, saved views, or credentials.
// Deliberately ignores seeded defaults (role_types / feed config), which a
// fresh account may already carry.
async function hasAnyUserData(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT
        (SELECT COUNT(*) FROM applications WHERE user_id = ?)
      + (SELECT COUNT(*) FROM companies WHERE user_id = ?)
      + (SELECT COUNT(*) FROM contacts WHERE user_id = ?)
      + (SELECT COUNT(*) FROM work_experience WHERE user_id = ?)
      + (SELECT COUNT(*) FROM education WHERE user_id = ?)
      + (SELECT COUNT(*) FROM skills WHERE user_id = ?)
      + (SELECT COUNT(*) FROM languages WHERE user_id = ?)
      + (SELECT COUNT(*) FROM saved_views WHERE user_id = ?)
      + (SELECT COUNT(*) FROM documents WHERE user_id = ?)
      + (SELECT COUNT(*) FROM tags WHERE user_id = ?)
      + (SELECT COUNT(*) FROM profile WHERE user_id = ?
           AND (name IS NOT NULL OR summary IS NOT NULL
                OR api_key IS NOT NULL OR share_token IS NOT NULL
                OR calendar_token IS NOT NULL)) AS n`,
  )
    .bind(
      userId, userId, userId, userId, userId, userId,
      userId, userId, userId, userId, userId,
    )
    .first<{ n: number }>();
  return (row?.n ?? 0) > 0;
}

app.get("/api/account/sample-data", async (c) => {
  const userId = c.get("userId");
  const profile = await c.env.DB.prepare(
    "SELECT sample_data_loaded FROM profile WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ sample_data_loaded: number }>();
  return c.json({
    loaded: !!profile?.sample_data_loaded,
    hasData: await hasAnyUserData(c.env, userId),
  });
});

app.post("/api/account/sample-data", async (c) => {
  const userId = c.get("userId");
  // Only seed a genuinely empty account — checking ALL user content, not
  // just applications — so the wipe-then-seed below can't destroy a CV,
  // contacts, or an API key the user already has (#285).
  if (await hasAnyUserData(c.env, userId)) {
    return c.json(
      { error: "account already has data — clear it first" },
      409,
    );
  }
  const user = await c.env.DB.prepare('SELECT email FROM "user" WHERE id = ?')
    .bind(userId)
    .first<{ email: string }>();
  // Wipe first so any stray defaults (role types, feed config) don't
  // collide with the seed's own inserts, then seed and set the flag.
  await wipeUserData(c.env, userId);
  await seedSampleData(c.env, userId, user?.email ?? "you@example.com");
  await c.env.DB.prepare(
    "UPDATE profile SET sample_data_loaded = 1 WHERE user_id = ?",
  )
    .bind(userId)
    .run();
  return c.json({ loaded: true });
});

app.delete("/api/account/sample-data", async (c) => {
  const userId = c.get("userId");
  // Preserve credentials that live on the profile row so removing the
  // sample account doesn't silently revoke an API key, share link, or
  // calendar link the user created while exploring (#285).
  const creds = await c.env.DB.prepare(
    "SELECT api_key, share_token, calendar_token FROM profile WHERE user_id = ?",
  )
    .bind(userId)
    .first<{
      api_key: string | null;
      share_token: string | null;
      calendar_token: string | null;
    }>();
  await wipeUserData(c.env, userId);
  if (creds && (creds.api_key || creds.share_token || creds.calendar_token)) {
    await c.env.DB.prepare(
      "INSERT INTO profile (user_id, api_key, share_token, calendar_token) VALUES (?, ?, ?, ?)",
    )
      .bind(userId, creds.api_key, creds.share_token, creds.calendar_token)
      .run();
  }
  return c.body(null, 204);
});

// Self-serve account deletion (#285) — GDPR/right-to-erasure. Deleting the
// user row cascades to session/account/twoFactor and every user-scoped
// table (all FK'd ON DELETE CASCADE, migration 0024); wipeUserData first is
// belt-and-suspenders. The session is invalidated once the row is gone.
app.delete("/api/account", async (c) => {
  const userId = c.get("userId");
  await wipeUserData(c.env, userId);
  await c.env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run();
  return c.body(null, 204);
});

app.notFound((c) => {
  // Genuine API misses stay JSON 404. Everything else that reached the
  // Worker is a client-side route (/jobs, /board, /stats, …) with no
  // matching asset — hand it to the SPA shell so react-router can render
  // it, instead of leaking the API's JSON 404 (#285). The assets binding
  // resolves the miss to index.html via not_found_handling.
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not found" }, 404);
  }
  if ((c.req.method === "GET" || c.req.method === "HEAD") && c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({ error: "not found" }, 404);
});

app.onError((err, c) => {
  // A malformed/empty JSON request body makes c.req.json() throw a
  // SyntaxError; surface it as 400, not a generic 500 (#285). Every write
  // route funnels through this single handler.
  if (err instanceof SyntaxError) {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (err.message.includes("CHECK constraint failed")) {
    return c.json({ error: "invalid value" }, 400);
  }
  if (err.message.includes("UNIQUE constraint failed")) {
    return c.json({ error: "already exists" }, 409);
  }
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

// Inbound recruiter emails, forwarded via Cloudflare Email Routing (#111)
// to a jobseekr.lokilabs.nl address, auto-log as an interaction against
// the matching contact instead of manual entry. Requires an Email Routing
// rule (Cloudflare dashboard, zone-level — not configurable from this
// repo) pointing the inbound address at this Worker.
export async function logInboundEmail(
  env: Env,
  fromAddress: string,
  subject: string,
): Promise<void> {
  fromAddress = fromAddress.toLowerCase();

  // Contacts are per-user now, so the same sender address could match a
  // contact belonging to more than one user. Matching purely on address
  // (see #179 for a real fix distinguishing the original sender) can't
  // disambiguate that case — skip rather than guess and log against the
  // wrong user's contact.
  const { results: contacts } = await env.DB.prepare(
    "SELECT id, user_id, outreach_status FROM contacts WHERE lower(email) = ?",
  )
    .bind(fromAddress)
    .all<{ id: number; user_id: string; outreach_status: string }>();
  if (contacts.length !== 1) return;
  const contact = contacts[0];

  await env.DB.prepare(
    `INSERT INTO interactions (contact_id, user_id, type, notes) VALUES (?, ?, 'email', ?)`,
  )
    .bind(contact.id, contact.user_id, subject)
    .run();

  if (contact.outreach_status === "awaiting_reply") {
    await env.DB.prepare(
      "UPDATE contacts SET outreach_status = 'replied' WHERE id = ?",
    )
      .bind(contact.id)
      .run();
  }
}

// Scheduled full backup to R2 (#116) — the CSV/JSON export was manual-only,
// so a stale database has no recovery path if D1 has an issue. Keeps the
// last 14 daily backups, pruning older ones on each run.
const BACKUP_PREFIX = "backups/";
const BACKUP_RETENTION = 14;

export async function runScheduledBackup(env: Env): Promise<void> {
  const dump = await buildFullExport(env);
  const key = `${BACKUP_PREFIX}${new Date().toISOString().slice(0, 10)}.json`;
  await env.DOCS.put(key, JSON.stringify(dump), {
    httpMetadata: { contentType: "application/json" },
  });

  const listed = await env.DOCS.list({ prefix: BACKUP_PREFIX });
  const keys = listed.objects.map((o) => o.key).sort();
  const toDelete = keys.slice(0, Math.max(0, keys.length - BACKUP_RETENTION));
  await Promise.all(toDelete.map((k) => env.DOCS.delete(k)));
}

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    if (event.cron === "11 3 * * *") {
      ctx.waitUntil(runScheduledBackup(env));
      return;
    }
    ctx.waitUntil(
      (async () => {
        const [feedResult] = await Promise.all([
          refreshFeed(env),
          checkStalePostings(env),
        ]);
        await generateNotifications(env, feedResult.inserted);
      })(),
    );
  },
  async email(message, env, ctx) {
    const subject = message.headers.get("subject") ?? "(no subject)";
    ctx.waitUntil(logInboundEmail(env, message.from, subject));
  },
} satisfies ExportedHandler<Env>;
