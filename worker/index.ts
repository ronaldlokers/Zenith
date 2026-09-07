import { Hono } from "hono";
import type { Context } from "hono";
import { pruneFeedItems, refreshFeed, registerFeedRoutes } from "./feed.js";
import { registerRoleTypeRoutes } from "./role-types.js";
import { recordCronRun } from "./cron-log.js";
import { pruneAuthRows } from "./retention.js";
import { registerShareRoutes } from "./share.js";
import { registerDocumentRoutes } from "./documents.js";
import { registerExportRoutes } from "./export.js";
import { registerImportRoutes } from "./import-posting.js";
import { happenedAtError } from "./interaction-validation.js";
import { runScheduledBackup } from "./backup.js";
import { checkStalePostings } from "./posting-check.js";
import { registerCvRoutes } from "./cv.js";
import { registerOutreachRoutes } from "./outreach.js";
import { registerGoalRoutes } from "./goals.js";
import { getAuth } from "./auth.js";
import { resetDemoData, seedSampleData, wipeUserData } from "./demo.js";
import { deleteDocumentObjects } from "./documents.js";
import { resolveOriginalSender } from "./forwarded-email.js";
import { deliverDueNotifications, generateNotifications, registerNotificationRoutes } from "./notifications.js";
import { generateWeeklyDigest } from "./digest.js";
import { registerAiRoutes } from "./ai.js";
import { registerCalendarRoutes } from "./calendar.js";
import { registerPushRoutes, sendPushToUser } from "./push.js";
import { resolveProvider } from "./email/index.js";
import { buildDigestEmail, buildReminderEmail, type ReminderItem } from "./email/messages.js";
import { registerApiKeyRoutes, registerPublicApiRoutes, triggerWebhooks } from "./public-api.js";
import { stale, conflict } from "./if-match.js";
// The one place the worker reaches into src/: the outcome vocabulary has to be
// identical on both sides (the client renders it, the worker validates against
// it), and a second copy would drift into a silent validation bug. Type-only
// plus a const table — no DOM, nothing browser-specific comes with it.
import { OUTCOME_REASONS, STATUSES as ALL_STATUSES, type TerminalStatus } from "../src/types.js";

export type AppEnv = {
  Bindings: Env;
  Variables: { userId: string; userRole: string | null };
};

const app = new Hono<AppEnv>();

// Security headers on every response. A deployment was sending none of
// these, on an app that holds CVs, salary figures and private notes behind
// a session cookie.
//
// The one that mattered most is framing. Nothing stopped another site
// putting this app in an invisible iframe over its own buttons, and the
// destructive actions here are single clicks — delete an application,
// delete the account. DENY rather than SAMEORIGIN: nothing here is meant to
// be framed at all.
//
// nosniff is belt-and-braces for uploaded documents. They already download
// with Content-Disposition: attachment rather than rendering, which is the
// real protection; this stops a browser second-guessing the type anyway.
//
// Referrer-Policy keeps a full URL from travelling to a third party when
// someone follows a job posting out of the app — the share and calendar
// links are unguessable tokens in a path, and a path is exactly what a
// referrer carries.
//
// The app's Content-Security-Policy. script-src 'self' is the line that
// matters: with no inline script allowed, an injected <script> or an onclick
// smuggled through user text does not run, which is the whole XSS class this
// app could plausibly meet (job titles, notes and company names are rendered
// everywhere).
//
// style-src-attr is the one concession, and it is deliberate. React writes
// the geometry this UI is made of into style attributes — funnel bar widths,
// the ascent strip's flex growth, the board's grid track list — all
// continuous values that cannot be a fixed class. Allowing inline *style
// attributes* while still refusing inline <style> elements and inline script
// is the narrow version of that concession: a style attribute cannot execute
// anything, and the CSS injection it would leave open needs an HTML
// injection first, which script-src already has to fail for.
//
// Verified rather than reasoned about: the production build was loaded from a
// preview deployment under this policy and reported no violations on any
// route.
//
// The dev relaxation is not a nicety. @cloudflare/vite-plugin runs this
// Worker in front of the dev server, so the policy applies to `npm run dev`
// too — and Vite injects React Refresh's preamble as an *inline* script,
// which script-src 'self' blocks. The result is a blank page and one console
// line ("@vitejs/plugin-react can't detect preamble"), which reads like a
// broken app rather than a header. Its HMR client also injects inline
// <style>, hence the style-src half.
//
// Keyed on MODE, not DEV. The Worker test runner is a Vite build too and sets
// DEV — so a DEV check would hand the tests the relaxed policy and leave the
// shipped one asserted by nothing. MODE separates the three: "development"
// for the dev server, "test" under vitest, "production" in the build. Only
// the first relaxes, and the substitution is at build time, so the deployed
// bundle carries the strict string and no branch (test-node/shipped-csp).
const DEV =
  (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ===
  "development";

const APP_CSP = [
  "default-src 'self'",
  DEV ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
  DEV ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

app.use("*", async (c, next) => {
  await next();
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  // No includeSubDomains and no preload. This is self-hosted software: an
  // operator we'll never meet may run it on an apex domain with unrelated
  // sibling subdomains that have no certificate, and preload implies
  // includeSubDomains while taking months to undo once a browser has it.
  // User agents ignore HSTS on plain HTTP by spec, so this isn't gated on
  // the request scheme.
  c.header("Strict-Transport-Security", "max-age=31536000");
  // Same precedent as the CSP below: a route that has chosen a stricter
  // policy keeps it. The share and calendar routes carry their token in the
  // URL and set no-referrer; this used to overwrite them on the way out, so
  // the stricter value never reached the browser. The app default is safe
  // for the app — cross-origin it sends only the origin — but a tokenised
  // page should not be relying on that distinction.
  if (!c.res.headers.get("Referrer-Policy")) {
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // The share page builds a stricter, nonced policy of its own; this must not
  // flatten it back to the app's. Anything that sets its own CSP keeps it.
  if (!c.res.headers.get("Content-Security-Policy")) {
    c.header("Content-Security-Policy", APP_CSP);
  }
});

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

// The numbers on this table had no bound of any kind — no CHECK constraint,
// no route validation — and totalComp() multiplies base by bonus_target_pct
// unconditionally, so a 500 typed into that field becomes a bonus five times
// salary in the offer comparison, the PDF export and the negotiation draft.
// Those three are exactly where the figures have to be trustworthy.
//
// Server-side rather than in the form, because the form is not the only
// writer: the browser extension posts applications, and PUT rewrites every
// column from the body.
//
// Zero is a real answer everywhere here (an unpaid internship, no bonus
// scheme, no equity), so the floor is inclusive. The bonus ceiling is
// generous on purpose — sales plans do reach three figures — it only has to
// catch someone typing a multiplier where a percentage goes.
const NUMERIC_BOUNDS: Record<string, [number, number]> = {
  salary_min: [0, Number.MAX_SAFE_INTEGER],
  salary_max: [0, Number.MAX_SAFE_INTEGER],
  signing_bonus: [0, Number.MAX_SAFE_INTEGER],
  equity_value: [0, Number.MAX_SAFE_INTEGER],
  bonus_target_pct: [0, 200],
  // The other unbounded number on the table: the rating renders as five
  // stars, so a 9 draws nine of them.
  fit_score: [1, 5],
};

// fit_score renders as whole stars, so a fractional value has no sane cast.
// The money fields have no such constraint (a salary_min of 85000.50 is a
// real number), so this is narrower than NUMERIC_BOUNDS on purpose.
const INTEGER_FIELDS = new Set(["fit_score"]);

// Returns the error message for the first field that is out of bounds, or
// null when there is nothing to object to. Absent and null are always fine —
// most applications carry no compensation at all.
export function compensationError(body: Record<string, unknown>): string | null {
  for (const [field, [min, max]] of Object.entries(NUMERIC_BOUNDS)) {
    const raw = body[field];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return `${field} must be a number`;
    if (INTEGER_FIELDS.has(field) && !Number.isInteger(n)) {
      return `${field} must be a whole number`;
    }
    if (n < min || n > max) return `${field} must be between ${min} and ${max}`;
  }
  // Both ends have to actually be there. Number(null) is 0, so reading the
  // pair unconditionally makes every row with a minimum and no maximum look
  // like a range that runs backwards — which is most of them.
  const present = (v: unknown) => v !== undefined && v !== null && v !== "";
  if (present(body.salary_min) && present(body.salary_max)) {
    const min = Number(body.salary_min);
    const max = Number(body.salary_max);
    if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
      return "salary_max must not be below salary_min";
    }
  }
  return null;
}

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

// Cross-tenant reference guard (security review, #445). The DB foreign keys
// on applications.company_id / contact_id / referred_by_contact_id and
// contacts.company_id only check that the row EXISTS, not that it belongs to
// the caller — so without this a user could attach another tenant's id and
// read its name back through the list joins. Returns the first table whose
// supplied id isn't owned by userId, or null when every ref is fine (or null).
async function findForeignRef(
  db: D1Database,
  userId: string,
  refs: { table: "companies" | "contacts"; id: unknown }[],
): Promise<string | null> {
  for (const { table, id } of refs) {
    if (id == null) continue;
    const owned = await db
      .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`)
      .bind(id, userId)
      .first();
    if (!owned) return table;
  }
  return null;
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
// Whether this deployment can send a password-reset email at all. Unauthenticated
// on purpose — it is asked by the sign-in page, before anyone has a session —
// and it reveals only whether outbound email is configured, which is a fact
// about the server rather than about any account.
//
// Without it a self-hoster with no RESEND_API_KEY gets a "Forgot your
// password?" link that promises an email nothing will ever send, which is the
// silent dead end this whole card is about.
app.get("/api/auth-capabilities", (c) =>
  c.json({ passwordReset: resolveProvider(c.env) !== null }),
);

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

// Company/contact column lists share applications' single-source-of-truth
// pattern (#346) so INSERT and UPDATE can't drift when a field is added.
const COMPANY_COLUMNS = [
  "name", "website", "location", "is_agency", "notes",
] as const;
function companyValues(body: Record<string, unknown>): unknown[] {
  return [
    body.name,
    body.website ?? null,
    body.location ?? null,
    body.is_agency ? 1 : 0,
    body.notes ?? null,
  ];
}

const CONTACT_COLUMNS = [
  "company_id", "name", "role", "email", "phone", "linkedin", "notes",
  "last_contacted_at", "follow_up_at", "outreach_status",
] as const;
function contactValues(body: Record<string, unknown>): unknown[] {
  return [
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
  ];
}

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
    `INSERT INTO companies (user_id, updated_at, ${COMPANY_COLUMNS.join(", ")})
     VALUES (?, datetime('now'), ${COMPANY_COLUMNS.map(() => "?").join(", ")})
     RETURNING *`,
  )
    .bind(c.get("userId"), ...companyValues(body))
    .first();
  return c.json(result, 201);
});

app.put("/api/companies/:id", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  // Optimistic concurrency, the same shape as applications and contacts: the
  // form seeds from the record loaded when the page opened and writes every
  // column, so a save from a stale copy reverts fields it never showed. 412
  // per RFC 9110 13.1.
  //
  // Additive: no header, no precondition. updated_at is second-resolution, so
  // two writes inside one second are a tie last-write-wins settles — the
  // conflict worth catching is a form left open for minutes.
  const ifMatch = c.req.header("If-Match");
  if (ifMatch) {
    const existing = await c.env.DB.prepare(
      "SELECT updated_at FROM companies WHERE id = ? AND user_id = ?",
    )
      .bind(c.req.param("id"), c.get("userId"))
      .first<{ updated_at: string | null }>();
    if (!existing) return c.json({ error: "not found" }, 404);
    if (stale(ifMatch, existing.updated_at)) {
      return c.json(
        conflict(existing.updated_at, "the company changed somewhere else"),
        412,
      );
    }
  }
  const result = await c.env.DB.prepare(
    `UPDATE companies SET ${COMPANY_COLUMNS.map((col) => `${col} = ?`).join(", ")},
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(...companyValues(body), c.req.param("id"), c.get("userId"))
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

// --- Contacts ---

app.get("/api/contacts", async (c) => {
  const { results } = await c.env.DB.prepare(
    // The join is scoped by user_id too (not just contacts.company_id) so a
    // stray cross-tenant company_id can never surface another user's name
    // (security review, #445 — defence in depth behind the write-time check).
    `SELECT contacts.*, companies.name AS company_name
     FROM contacts
     LEFT JOIN companies ON companies.id = contacts.company_id
                        AND companies.user_id = contacts.user_id
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
  const badRef = await findForeignRef(c.env.DB, c.get("userId"), [
    { table: "companies", id: body.company_id },
  ]);
  if (badRef) return c.json({ error: `invalid ${badRef} reference` }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO contacts (user_id, updated_at, ${CONTACT_COLUMNS.join(", ")})
     VALUES (?, datetime('now'), ${CONTACT_COLUMNS.map(() => "?").join(", ")})
     RETURNING *`,
  )
    .bind(c.get("userId"), ...contactValues(body))
    .first();
  return c.json(result, 201);
});

app.put("/api/contacts/:id", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  // Cheapest rejection first: a bad reference is a malformed request and
  // doesn't need a concurrency check to reject it, so it's computed and
  // checked here rather than after the If-Match block below.
  //
  // That also settles a status this route used to decide by header. The check
  // sat after the block, so the same malformed body answered 400 with no
  // If-Match and 404 with one — the 404 coming from the existence check that
  // only runs when the header is present. It is 400 either way now.
  const badRef = await findForeignRef(c.env.DB, c.get("userId"), [
    { table: "companies", id: body.company_id },
  ]);
  if (badRef) return c.json({ error: `invalid ${badRef} reference` }, 400);
  // Optimistic concurrency, the same shape as applications: the form seeds
  // from the record loaded when the page opened and writes every column, so a
  // save made from a stale copy reverts fields it never showed. 412 per RFC
  // 9110 13.1, and the header keeps the body as the resource.
  //
  // Additive: no header, no precondition, so every existing caller behaves as
  // before. updated_at is second-resolution, so two writes inside one second
  // are a tie that last-write-wins settles — the conflict worth catching is a
  // form left open for minutes.
  const ifMatch = c.req.header("If-Match");
  if (ifMatch) {
    const existing = await c.env.DB.prepare(
      "SELECT updated_at FROM contacts WHERE id = ? AND user_id = ?",
    )
      .bind(c.req.param("id"), c.get("userId"))
      .first<{ updated_at: string | null }>();
    if (!existing) return c.json({ error: "not found" }, 404);
    if (stale(ifMatch, existing.updated_at)) {
      return c.json(
        conflict(existing.updated_at, "the contact changed somewhere else"),
        412,
      );
    }
  }
  const result = await c.env.DB.prepare(
    `UPDATE contacts SET ${CONTACT_COLUMNS.map((col) => `${col} = ?`).join(", ")},
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(...contactValues(body), c.req.param("id"), c.get("userId"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

// Narrow writes for the panels that own one or two fields. The outreach
// composer used PUT with { ...contact, last_contacted_at, outreach_status },
// and that route writes every column, so "mark contacted" put back the whole
// contact as it had been when the panel loaded — measured: a note added
// elsewhere reverted, with the mark reported as saved.
app.patch("/api/contacts/:id", async (c) => {
  const body = await c.req.json();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if ("last_contacted_at" in body) {
    sets.push("last_contacted_at = ?");
    vals.push(body.last_contacted_at ?? null);
  }
  if ("outreach_status" in body) {
    sets.push("outreach_status = ?");
    vals.push(body.outreach_status ?? null);
  }
  if (!sets.length) return c.json({ error: "nothing to update" }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE contacts SET ${sets.join(", ")}, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(...vals, c.req.param("id"), c.get("userId"))
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
    // Every join is scoped by user_id too, so a cross-tenant company_id /
    // contact_id can never surface another user's name (security review,
    // #445 — defence in depth behind the write-time findForeignRef check).
    `SELECT applications.*, companies.name AS company_name, contacts.name AS contact_name,
            referrer.name AS referred_by_name,
            -- Unchecked prep items, so Today can see the checklist without a
            -- fetch per application (#109). Scoped by user_id like every other
            -- join here, even though the rows hang off an application this
            -- query has already scoped.
            (SELECT COUNT(*) FROM interview_prep_items
              WHERE interview_prep_items.application_id = applications.id
                AND interview_prep_items.user_id = applications.user_id
                AND interview_prep_items.done = 0) AS open_prep_items
     FROM applications
     LEFT JOIN companies ON companies.id = applications.company_id
                        AND companies.user_id = applications.user_id
     LEFT JOIN contacts ON contacts.id = applications.contact_id
                       AND contacts.user_id = applications.user_id
     LEFT JOIN contacts AS referrer ON referrer.id = applications.referred_by_contact_id
                                   AND referrer.user_id = applications.user_id
     WHERE applications.user_id = ?
     ORDER BY applications.updated_at DESC`,
  )
    .bind(c.get("userId"))
    .all<{ id: number }>();
  const { results: tagLinks } = await c.env.DB.prepare(
    `SELECT application_tags.application_id, tags.id, tags.name
     FROM application_tags
     JOIN tags ON tags.id = application_tags.tag_id
              AND tags.user_id = application_tags.user_id
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
  // RETURNING can be null on an unexpected write failure; a clean 500 beats a
  // "Cannot read properties of null" further down (#449).
  if (!row) return c.json({ error: "could not create saved view" }, 500);
  return c.json({ ...row, filters: JSON.parse(row.filters) }, 201);
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
  // RETURNING can be null on an unexpected write failure — bail cleanly
  // instead of dereferencing null with tag!.id below (#449).
  if (!tag) return c.json({ error: "could not create tag" }, 500);
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
    .bind(c.req.param("id"), tag.id, userId, next_order)
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
  const badRef = await findForeignRef(c.env.DB, userId, [
    { table: "companies", id: body.company_id },
    { table: "contacts", id: body.contact_id },
    { table: "contacts", id: body.referred_by_contact_id },
  ]);
  if (badRef) return c.json({ error: `invalid ${badRef} reference` }, 400);
  const outOfBounds = compensationError(body);
  if (outOfBounds) return c.json({ error: outOfBounds }, 400);
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

// Archiving clears the pin. The two states contradict each other — a pin is
// "one of the handful I am working", archiving is "I am done with this" — and
// leaving both set showed the bar counting a pinned application that the
// board could not show, because an archived card sits on a rail that is
// folded by default. Unarchiving does not restore the pin: if the work
// resumes, pinning it again is the same click that unarchived it.
app.post("/api/applications/:id/archive", async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE applications SET archived_at = datetime('now'), pinned_at = NULL,
       updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

// Pinning is orthogonal to the pipeline (#535 shell): an application keeps
// its stage and its column, and the bottom bar's first slot filters the board
// down to the pinned set rather than moving anything into a place of its own.
// Same shape as archive/unarchive above, including RETURNING * so the client
// can replace its row without a refetch.
app.post("/api/applications/:id/pin", async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE applications SET pinned_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(c.req.param("id"), c.get("userId"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.post("/api/applications/:id/unpin", async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE applications SET pinned_at = NULL, updated_at = datetime('now')
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
  const outOfBounds = compensationError(body);
  if (outOfBounds) return c.json({ error: outOfBounds }, 400);
  const userId = c.get("userId");
  const existing = await c.env.DB.prepare(
    "SELECT status, updated_at, job_description, job_description_captured_at FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("id"), userId)
    .first<{
      status: string;
      updated_at: string;
      job_description: string | null;
      job_description_captured_at: string | null;
    }>();
  if (!existing) return c.json({ error: "not found" }, 404);
  // Cheapest rejection first: a bad reference is a malformed request and
  // doesn't need a concurrency check to reject it, so it's computed and
  // checked here rather than after the If-Match block below.
  const badRef = await findForeignRef(c.env.DB, userId, [
    { table: "companies", id: body.company_id },
    { table: "contacts", id: body.contact_id },
    { table: "contacts", id: body.referred_by_contact_id },
  ]);
  if (badRef) return c.json({ error: `invalid ${badRef} reference` }, 400);
  // Optimistic concurrency. This route writes every column from the body, so
  // a client that loaded the row before someone else's save will carry stale
  // copies of the fields it did not touch and put them back — measured: two
  // saves, both 200, one note silently gone. The likely pair is not two
  // forms, it is a note typed on a phone and then a form saved on a laptop
  // that had been open since breakfast.
  //
  // If-Match with updated_at as the validator, and 412 rather than 409: RFC
  // 9110 13.1 is explicit that a failed precondition is 412, and keeping the
  // version in a header leaves the body as the resource rather than a
  // resource plus bookkeeping.
  //
  // Additive on purpose. No header means no precondition, so every existing
  // caller — the cover-letter panel, the extension, anything else — behaves
  // exactly as before rather than starting to fail.
  //
  // updated_at is datetime('now'), which is second-resolution, so two writes
  // inside one second are indistinguishable and the second is not caught.
  // That is the case this is least needed for: the conflict being prevented
  // is minutes-to-hours old — a form left open — and two saves racing inside
  // one second are a genuine tie where last-write-wins is a defensible
  // answer. A monotonic version column would close it and costs a migration
  // plus every write path; it is not worth that for the remaining sliver.
  const ifMatch = c.req.header("If-Match");
  if (stale(ifMatch, existing.updated_at)) {
    return c.json(
      conflict(existing.updated_at, "the application changed somewhere else"),
      412,
    );
  }
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

// Why an application ended (#381). The reason belongs to the transition, so
// this writes onto the status_history row rather than the application: an
// application reopened and closed again keeps both outcomes, each bound to
// the stage it happened at.
//
// One route serves both the capture dialog (which fires straight after the
// move) and a later edit from the detail page, so it resolves the target row
// itself — the latest terminal transition for this application. Changing
// status twice while the dialog is open therefore lands the reason on the
// newer transition; accepted over threading a row id through every
// status-change response, since the window is a user racing themselves.
app.put("/api/applications/:id/outcome", async (c) => {
  const body = await c.req.json<{ reason?: string | null; note?: string | null }>();
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    `SELECT id, to_status FROM status_history
     WHERE application_id = ? AND user_id = ? AND to_status IN ('rejected', 'withdrawn', 'ghosted')
     ORDER BY changed_at DESC, id DESC LIMIT 1`,
  )
    .bind(c.req.param("id"), userId)
    .first<{ id: number; to_status: TerminalStatus }>();
  if (!row) return c.json({ error: "not found" }, 404);

  const reason = body.reason?.trim() || null;
  // Validated against the vocabulary for this row's own to_status, not the
  // union of all three: comp_too_low is not a thing that happens to a
  // ghosted application, and storing it would poison the breakdown.
  if (reason && !OUTCOME_REASONS[row.to_status].includes(reason)) {
    return c.json({ error: `reason is not valid for ${row.to_status}` }, 400);
  }
  const note = reason ? body.note?.trim() || null : null;
  await c.env.DB.prepare(
    "UPDATE status_history SET outcome_reason = ?, outcome_note = ? WHERE id = ?",
  )
    .bind(reason, note, row.id)
    .run();
  return c.json({ outcome_reason: reason, outcome_note: note });
});

app.delete("/api/applications/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  // documents cascades with the row, and the cascade runs inside SQLite where
  // no code of ours does — so the keys are read here or the files are
  // stranded. Measured before this: deleting an application left both of its
  // uploads in the bucket with every row that named them gone.
  const { results } = await c.env.DB.prepare(
    "SELECT key FROM documents WHERE application_id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .all<{ key: string }>();
  await deleteDocumentObjects(
    c.env.DOCS,
    results.map((r) => r.key),
  );
  const result = await c.env.DB.prepare(
    "DELETE FROM applications WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .run();
  // Not an idempotent 204. A DELETE of something already gone is defensible
  // as success, and it is not what this app wants: the frontend hides the row
  // optimistically and only restores it on an error, so a 204 for a row that
  // was never the caller's left the board showing a delete that did not
  // happen until the next reload. Matches the sibling routes, which 404 on a
  // row the user_id scope did not reach.
  if (!result.meta.changes) return c.json({ error: "not found" }, 404);
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
  // The cover-letter panel writes through here rather than PUT. It used to
  // send { ...application, cover_letter }, and PUT writes every column, so a
  // page loaded before a note was typed elsewhere put the old note back —
  // measured: notes and fit_score both reverted to null by a save the person
  // thought only touched their cover letter.
  if ("cover_letter" in body) {
    sets.push("cover_letter = ?");
    vals.push(body.cover_letter ?? null);
  }
  if ("fit_score" in body) {
    // Same rule as POST/PUT, from the same place — a second inline copy of
    // this check is exactly how it drifted out of sync with them before.
    const outOfBounds = compensationError({ fit_score: body.fit_score });
    if (outOfBounds) return c.json({ error: outOfBounds }, 400);
    sets.push("fit_score = ?");
    vals.push(body.fit_score ?? null);
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
  const dateError = happenedAtError(body);
  if (dateError) return c.json({ error: dateError }, 400);
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
  const dateError = happenedAtError(body);
  if (dateError) return c.json({ error: dateError }, 400);
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
                          AND companies.user_id = applications.user_id
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
                             AND applications.user_id = interactions.user_id
       LEFT JOIN companies ON companies.id = applications.company_id
                          AND companies.user_id = interactions.user_id
       LEFT JOIN contacts ON contacts.id = COALESCE(interactions.contact_id, applications.contact_id)
                         AND contacts.user_id = interactions.user_id
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
                          AND companies.user_id = applications.user_id
       WHERE applications.user_id = ?
         AND applications.applied_at IS NOT NULL
         -- Forward-looking agenda: bound the apply-date leg like the
         -- interactions leg (#346), else old applies dominate forever.
         AND applications.applied_at >= date('now', '-14 days')`,
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
                        AND a.user_id = sh.user_id
     LEFT JOIN companies comp ON comp.id = a.company_id
                             AND comp.user_id = sh.user_id
     WHERE sh.user_id = ?1

     UNION ALL

     SELECT 'interaction', i.application_id, a.title, comp.name,
            NULL, NULL, i.type, i.notes, NULL,
            i.happened_at
     FROM interactions i
     JOIN applications a ON a.id = i.application_id
                        AND a.user_id = i.user_id
     LEFT JOIN companies comp ON comp.id = a.company_id
                             AND comp.user_id = i.user_id
     WHERE i.user_id = ?1 AND i.application_id IS NOT NULL

     UNION ALL

     SELECT 'document', d.application_id, a.title, comp.name,
            NULL, NULL, NULL, NULL, d.filename,
            d.created_at
     FROM documents d
     JOIN applications a ON a.id = d.application_id
                        AND a.user_id = d.user_id
     LEFT JOIN companies comp ON comp.id = a.company_id
                             AND comp.user_id = d.user_id
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
      // outcome_reason/outcome_note ride along here (#381) so Insights can
      // build its breakdown client-side, like every other insight on that
      // tab — no second endpoint. The share page's copy of this query
      // deliberately takes neither; see it below.
      `SELECT application_id, from_status, to_status, changed_at, outcome_reason, outcome_note
       FROM status_history WHERE user_id = ? ORDER BY application_id, changed_at, id`,
    )
      .bind(userId)
      .all(),
    // Last logged interaction per application — the Pipeline's "gone
    // quiet" badge counts a nudge as activity (#314 round 3), not just
    // stage moves.
    c.env.DB.prepare(
      // Mirrors the per-application timeline's semantics (#346): an
      // interaction logged on the linked contact (application_id NULL)
      // counts as activity for that application too — otherwise the
      // "gone quiet" badge never clears when the nudge is logged on the
      // recruiter instead of the application.
      `SELECT a.id AS application_id, MAX(i.happened_at) AS last_at
       FROM interactions i
       JOIN applications a
         ON a.user_id = i.user_id
        AND (i.application_id = a.id
         OR (i.application_id IS NULL AND i.contact_id = a.contact_id))
       WHERE i.user_id = ?
       GROUP BY a.id`,
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

// Which board stages are folded (#535 shell). A preference rather than CV
// data, so it gets its own route instead of riding on PUT /api/profile —
// which sets an explicit column list and would otherwise have to be taught
// about a field the CV form knows nothing about.
//
// Validated against the real stage list: the column is read straight back
// into layout state, and an unrecognised slug there would fold a column that
// does not exist while leaving a real one open.
// What the board can fold: the eight stages, plus the manual archive, which
// is not a status but is a rail on the board that folds and unfolds exactly
// like one. Ordered as the board orders them, since that is the order the
// stored value is canonicalized into.
const BOARD_RAILS = [...ALL_STATUSES, "archived"] as readonly string[];

app.put("/api/profile/board-folded", async (c) => {
  const body = await c.req.json<{ folded?: unknown }>();
  if (!Array.isArray(body.folded)) {
    return c.json({ error: "folded must be an array of rail slugs" }, 400);
  }
  const sent: unknown[] = body.folded;
  const unknown = sent.filter(
    (v) => typeof v !== "string" || !BOARD_RAILS.includes(v),
  );
  if (unknown.length) {
    return c.json({ error: `unknown rail: ${unknown.join(", ")}` }, 400);
  }
  // Deduplicated and stored in the canonical rail order, so the round trip
  // is stable no matter what order the client sent.
  const folded = BOARD_RAILS.filter((s) => sent.includes(s));
  await c.env.DB.prepare(
    `INSERT INTO profile (user_id, board_folded) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET board_folded = excluded.board_folded`,
  )
    .bind(c.get("userId"), folded.join(","))
    .run();
  return c.json({ board_folded: folded });
});

// Whether the share page says whose search it is. Its own route for the same
// reason board-folded has one: PUT /api/profile writes an explicit CV column
// list and knows nothing about sharing preferences.
//
// Off by default, and it stays a separate decision from generating the link —
// handing someone a URL is not the same act as putting your name on a public
// page, and the privacy-first default only holds if the second one is opted
// into on purpose.
app.put("/api/profile/share-identity", async (c) => {
  const body = await c.req.json<{ show?: unknown }>();
  if (typeof body.show !== "boolean") {
    return c.json({ error: "show must be a boolean" }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO profile (user_id, share_show_identity) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET share_show_identity = excluded.share_show_identity`,
  )
    .bind(c.get("userId"), body.show ? 1 : 0)
    .run();
  return c.json({ share_show_identity: body.show });
});

app.delete("/api/profile/share-token", async (c) => {
  await c.env.DB.prepare("UPDATE profile SET share_token = NULL WHERE user_id = ?")
    .bind(c.get("userId"))
    .run();
  return c.body(null, 204);
});

// Persist the user's UI language server-side so worker-generated content (the
// weekly digest) can be localized — the worker has no react-i18next and no
// other source of the user's locale. The UI still drives the switch via
// i18n/localStorage; this just mirrors it into the user row.
app.put("/api/preferences/locale", async (c) => {
  const { locale } = await c.req.json<{ locale?: string }>();
  if (locale !== "en" && locale !== "nl") {
    return c.json({ error: "unsupported locale" }, 400);
  }
  await c.env.DB.prepare('UPDATE "user" SET locale = ? WHERE id = ?')
    .bind(locale, c.get("userId"))
    .run();
  return c.body(null, 204);
});

// Validation is by construction, not by list membership: Intl.supportedValuesOf
// omits "UTC" — which is our own fallback — and may omit legacy aliases like
// Asia/Calcutta. Anything Intl can build a formatter for is a zone we can use.
function isUsableTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

app.get("/api/preferences", async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT locale, timezone, email_reminders, email_digest FROM "user" WHERE id = ?',
  )
    .bind(c.get("userId"))
    .first<{
      locale: string | null;
      timezone: string | null;
      email_reminders: number;
      email_digest: number;
    }>();
  return c.json({
    locale: row?.locale ?? null,
    timezone: row?.timezone ?? null,
    emailReminders: row?.email_reminders === 1,
    emailDigest: row?.email_digest === 1,
  });
});

// The client mirrors its detected zone here once, and the Settings select
// writes here on change. The server needs it because SQLite's date('now') is
// UTC and knows nothing about who is asking.
app.put("/api/preferences/timezone", async (c) => {
  const { timezone } = await c.req.json<{ timezone?: string }>();
  if (typeof timezone !== "string" || !isUsableTimeZone(timezone)) {
    return c.json({ error: "unsupported timezone" }, 400);
  }
  await c.env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
    .bind(timezone, c.get("userId"))
    .run();
  return c.body(null, 204);
});

// Which emails the user wants. Per email, not per notification type: the four
// reminder types batch into one message, so four switches would imply a
// granularity the delivery does not have.
app.put("/api/preferences/email", async (c) => {
  const body = await c.req.json<{ emailReminders?: unknown; emailDigest?: unknown }>();
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [key, column] of [
    ["emailReminders", "email_reminders"],
    ["emailDigest", "email_digest"],
  ] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      return c.json({ error: `${key} must be a boolean` }, 400);
    }
    sets.push(`${column} = ?`);
    binds.push(value ? 1 : 0);
  }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);
  await c.env.DB.prepare(`UPDATE "user" SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, c.get("userId"))
    .run();
  return c.body(null, 204);
});


registerFeedRoutes(app);
registerShareRoutes(app);
registerDocumentRoutes(app);
registerExportRoutes(app);
registerImportRoutes(app);
registerRoleTypeRoutes(app);
registerCvRoutes(app);
registerOutreachRoutes(app);
registerGoalRoutes(app);
registerNotificationRoutes(app);
registerAiRoutes(app);
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

// Admin push-notification test — send a sample push of a chosen type to
// yourself, to verify the push pipeline end to end. Returns how many of your
// subscriptions it targeted (0 = no push subscription for you; note iOS only
// delivers web push to an installed PWA, not a Safari tab).
// Kept in sync with AppNotification.type in src/types.ts (the worker can't
// import from src across the tsconfig boundary).
type AppNotificationType =
  | "due_followup"
  | "stale_posting"
  | "feed_match"
  | "due_contact"
  | "weekly_digest"
  | "upcoming_followup"
  | "upcoming_contact";

const TEST_PUSH_SAMPLES: Record<
  AppNotificationType,
  { title: string; body: string; url: string }
> = {
  due_followup: { title: "Follow-up due", body: "Senior Engineer · Acme", url: "/board/1" },
  stale_posting: { title: "Posting may be gone", body: "Senior Engineer · Acme", url: "/board/1" },
  feed_match: { title: "3 new listing(s) in your Feed", body: "", url: "/feed" },
  due_contact: { title: "Ada Lovelace", body: "Recruiter", url: "/people/1" },
  weekly_digest: { title: "Your week on Zenith", body: "4 added · 2 advanced · 3 need a nudge", url: "/" },
  upcoming_followup: { title: "Follow-up tomorrow", body: "Senior Engineer · Acme", url: "/board/1" },
  upcoming_contact: { title: "Ada Lovelace", body: "Recruiter", url: "/people/1" },
};

app.post("/api/admin/test-push", async (c) => {
  const { type } = await c.req.json<{ type?: string }>();
  if (!type || !(type in TEST_PUSH_SAMPLES)) {
    return c.json({ error: "unknown notification type" }, 400);
  }
  const userId = c.get("userId");
  const { results: subs } = await c.env.DB.prepare(
    "SELECT id FROM push_subscriptions WHERE user_id = ?",
  )
    .bind(userId)
    .all();
  const sample = TEST_PUSH_SAMPLES[type as AppNotificationType];
  await sendPushToUser(c.env, userId, {
    title: `[test] ${sample.title}`,
    body: sample.body,
    url: sample.url,
  });
  return c.json({ sent: subs.length });
});

const TEST_REMINDER_SAMPLE: ReminderItem[] = [
  { kind: "due", title: "Senior Engineer · Acme", body: "Follow-up due" },
  { kind: "upcoming", title: "Ada Lovelace", body: "Recruiter" },
];

// Admin email test-send (#62, #114) — same shape as test-push above, but
// deliberately the inverse of the delivery gate it verifies. That gate
// (notifications.ts) uses sendEmail, which swallows every failure by design:
// it runs once per user in a loop, and one bad address must not stop the
// rest. That makes a missing key, an unverified domain, or a rejected call
// all invisible — the only symptom would be a Monday that passes without a
// digest. So this route calls resolveProvider/provider.send directly instead
// of sendEmail, to surface the provider's real error, and it ignores the
// email_reminders/email_digest toggles — those govern scheduled delivery,
// not whether the transport itself is configured, and honoring them here
// would let "reminders off" report success while sending nothing.
app.post("/api/admin/test-email", async (c) => {
  const { type } = await c.req.json<{ type?: string }>();
  if (type !== "reminders" && type !== "digest") {
    return c.json({ error: "unknown email type" }, 400);
  }
  const userId = c.get("userId");
  const user = await c.env.DB.prepare('SELECT email, locale FROM "user" WHERE id = ?')
    .bind(userId)
    .first<{ email: string; locale: string | null }>();
  if (!user) return c.json({ error: "user not found" }, 404);

  const provider = resolveProvider(c.env);
  if (!provider) {
    return c.json({ error: "email is not configured: RESEND_API_KEY is not set" }, 503);
  }

  const msg =
    type === "reminders"
      ? buildReminderEmail(user.email, user.locale ?? "en", TEST_REMINDER_SAMPLE)
      : buildDigestEmail(
          user.email,
          "Your week on Zenith",
          "4 added · 2 advanced · 3 need a nudge",
          user.locale ?? "en",
        );

  try {
    await provider.send({ ...msg, subject: `[test] ${msg.subject}` });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  return c.json({ sent: true, provider: provider.name });
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
                OR api_key_hash IS NOT NULL OR share_token IS NOT NULL
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
    "SELECT api_key_hash, api_key_hint, api_key_created_at, share_token, calendar_token FROM profile WHERE user_id = ?",
  )
    .bind(userId)
    .first<{
      api_key_hash: string | null;
      api_key_hint: string | null;
      api_key_created_at: string | null;
      share_token: string | null;
      calendar_token: string | null;
    }>();
  await wipeUserData(c.env, userId);
  if (
    creds &&
    (creds.api_key_hash || creds.share_token || creds.calendar_token)
  ) {
    await c.env.DB.prepare(
      "INSERT INTO profile (user_id, api_key_hash, api_key_hint, api_key_created_at, share_token, calendar_token) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        userId,
        creds.api_key_hash,
        creds.api_key_hint,
        creds.api_key_created_at,
        creds.share_token,
        creds.calendar_token,
      )
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
  // Worker is a client-side route (/board, /feed, /insights, …) with no
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
// to a zenith.lokilabs.nl address, auto-log as an interaction against
// the matching contact instead of manual entry. Requires an Email Routing
// rule (Cloudflare dashboard, zone-level — not configurable from this
// repo) pointing the inbound address at this Worker.
export async function logInboundEmail(
  env: Env,
  fromAddress: string,
  subject: string,
  // The SMTP envelope sender — who put this message into the ingest address.
  // For the way this feature is actually used that is the account holder
  // forwarding a recruiter's mail to themselves.
  envelopeFrom: string,
): Promise<void> {
  fromAddress = fromAddress.toLowerCase();

  // Whose mailbox this arrived from decides whose account it may touch.
  //
  // Before this, the contact lookup ran across every user's contacts on the
  // strength of a From address alone — and the From of a forwarded message is
  // read out of the body, which anyone who can mail the ingest address can
  // write. So a stranger could have an interaction logged against another
  // person's contact, carrying attacker-chosen text, and flip that contact's
  // outreach_status to "replied" so a real follow-up stopped being prompted.
  //
  // Resolving the forwarder first bounds every one of those to the account
  // that forwarded the mail. It also drops a case that used to work: a
  // recruiter mailing the ingest address directly is no longer logged,
  // because there is nobody it can safely be attributed to. That was the
  // unauthenticated path, so losing it is the fix rather than a casualty of
  // it.
  //
  // Not solved here, and worth being plain about: an SMTP envelope sender is
  // itself forgeable. This narrows the blast radius from "any account" to
  // "the account whose address was forged", which is the part that was
  // actually wrong. Requiring SPF to pass would be the next step and is not
  // free — forwarding routinely breaks SPF, which is precisely what this
  // feature is for.
  const forwarder = await env.DB.prepare(
    'SELECT id FROM "user" WHERE lower(email) = ?',
  )
    .bind(envelopeFrom.toLowerCase())
    .first<{ id: string }>();
  if (!forwarder) return;

  // Scoped to that user. Contacts are per-user, so the same address can exist
  // for several people; matching on address alone could not tell them apart
  // and skipped rather than guess. Now there is nothing to guess about.
  const { results: contacts } = await env.DB.prepare(
    "SELECT id, user_id, outreach_status FROM contacts WHERE lower(email) = ? AND user_id = ?",
  )
    .bind(fromAddress, forwarder.id)
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

// The last run of each task, which is what answers "is anything broken" and
// "is anything not running". Admin-only: it says nothing about any user's
// data, but it is operational detail rather than product.
app.get("/api/admin/cron-runs", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT label, ok, error, ran_at
       FROM cron_runs
      WHERE id IN (SELECT MAX(id) FROM cron_runs GROUP BY label)
      ORDER BY label`,
  ).all();
  return c.json(results);
});

// The feed pull stays 6-hourly: the sources are external and nothing about a
// listing needs hourly resolution. Only the push pass does, so it can land
// near 08:00 local in any timezone. Reproduces the old "17 */6 * * *".
export function shouldRunFeedPull(scheduledAt: Date): boolean {
  return scheduledAt.getUTCHours() % 6 === 0;
}

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    // Every background task carries its own catch. Without one a rejection
    // leaves the invocation as a bare "script threw an exception" with
    // nothing saying which task failed — which is the same reasoning the feed
    // pull below already had, applied to the two that did not have it.
    const independently = (label: string, work: Promise<unknown>) =>
      ctx.waitUntil(
        work.then(
          () => recordCronRun(env, label, null),
          (err: unknown) => {
            console.error(`scheduled ${label} failed`, err);
            return recordCronRun(env, label, err);
          },
        ),
      );

    if (event.cron === "11 3 * * *") {
      independently("backup", runScheduledBackup(env));
      // Its own waitUntil, not chained onto the backup: the two have nothing
      // to do with each other and a retention failure must not be the reason
      // a backup did not happen.
      independently("auth retention", pruneAuthRows(env));
      // Before the backup would be tidier, but they are independent on
      // purpose: a prune that throws must not be the reason a backup did not
      // happen, and a backup carrying one extra day of stale postings is a
      // far smaller problem than no backup at all.
      independently("feed retention", pruneFeedItems(env));
      return;
    }
    if (event.cron === "0 8 * * 1") {
      independently("weekly digest", generateWeeklyDigest(env));
      return;
    }
    // event.scheduledTime, not Date.now(): a retried or delayed invocation
    // must branch on the time it was scheduled for, or it would skip or
    // double the feed pull.
    if (shouldRunFeedPull(new Date(event.scheduledTime))) {
      // Three tasks, three waitUntils, because a D1 outage inside one must
      // not stop the others. It also means they start concurrently rather
      // than in sequence: a notification this run's generateNotifications
      // inserts can miss this run's delivery pass and go out on the next
      // hourly one instead — up to an hour late, not incorrect.
      //
      // The stale-posting check used to sit inside the feed pull's
      // Promise.all, so a throw there rejected the whole block and
      // generateNotifications never ran. The feed notification is keyed one
      // per user per day, so the batch just inserted got no notification at
      // all rather than a late one. Not a hypothetical pairing either: the
      // empty-candidate-set throw fixed in #530 was in exactly this function.
      // It has nothing to do with feed notifications and should not be able
      // to stop them.
      //
      // generateNotifications stays behind refreshFeed, because it is handed
      // that run's inserted count and genuinely depends on it.
      independently("stale-posting check", checkStalePostings(env));
      independently(
        "feed pull",
        (async () => {
          const feedResult = await refreshFeed(env);
          await generateNotifications(env, feedResult.inserted);
        })(),
      );
    }
    independently("notification delivery", deliverDueNotifications(env));
  },
  async email(message, env, ctx) {
    const subject = message.headers.get("subject") ?? "(no subject)";
    // The envelope From is the forwarder, not the recruiter, whenever this is
    // used the way it actually is — see worker/forwarded-email.ts (#179).
    ctx.waitUntil(
      resolveOriginalSender(message.raw, message.from).then((sender) =>
        logInboundEmail(env, sender.address, subject, message.from),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
