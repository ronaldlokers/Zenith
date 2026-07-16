import { Hono } from "hono";
import { refreshFeed, registerFeedRoutes } from "./feed.js";
import { registerRoleTypeRoutes } from "./role-types.js";
import { checkStalePostings } from "./posting-check.js";
import { registerCvRoutes } from "./cv.js";

const app = new Hono<{ Bindings: Env }>();

// --- Companies ---

app.get("/api/companies", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM companies ORDER BY name",
  ).all();
  return c.json(results);
});

app.post("/api/companies", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO companies (name, website, location, is_agency, notes)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
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
     WHERE id = ? RETURNING *`,
  )
    .bind(
      body.name,
      body.website ?? null,
      body.location ?? null,
      body.is_agency ? 1 : 0,
      body.notes ?? null,
      c.req.param("id"),
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.delete("/api/companies/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM companies WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.body(null, 204);
});

app.post("/api/companies/:id/research", async (c) => {
  const company = await c.env.DB.prepare(
    "SELECT id, website FROM companies WHERE id = ?",
  )
    .bind(c.req.param("id"))
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

  let html: string;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
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
     WHERE id = ? RETURNING *`,
  )
    .bind(description, logo, company.id)
    .first();
  return c.json(result);
});

// --- Contacts ---

app.get("/api/contacts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT contacts.*, companies.name AS company_name
     FROM contacts LEFT JOIN companies ON companies.id = contacts.company_id
     ORDER BY contacts.name`,
  ).all();
  return c.json(results);
});

app.post("/api/contacts", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO contacts (company_id, name, role, email, phone, linkedin, notes, last_contacted_at, follow_up_at, outreach_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
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
     WHERE id = ? RETURNING *`,
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
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.delete("/api/contacts/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM contacts WHERE id = ?")
    .bind(c.req.param("id"))
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
     ORDER BY applications.updated_at DESC`,
  ).all<{ id: number }>();
  const { results: tagLinks } = await c.env.DB.prepare(
    `SELECT application_tags.application_id, tags.id, tags.name
     FROM application_tags
     JOIN tags ON tags.id = application_tags.tag_id`,
  ).all<{ application_id: number; id: number; name: string }>();
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
    "SELECT * FROM tags ORDER BY name",
  ).all();
  return c.json(results);
});

app.post("/api/applications/:id/tags", async (c) => {
  const body = await c.req.json();
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ error: "name is required" }, 400);

  let tag = await c.env.DB.prepare(
    "SELECT * FROM tags WHERE name = ? COLLATE NOCASE",
  )
    .bind(name)
    .first<{ id: number; name: string }>();
  if (!tag) {
    tag = await c.env.DB.prepare(
      "INSERT INTO tags (name) VALUES (?) RETURNING *",
    )
      .bind(name)
      .first<{ id: number; name: string }>();
  }
  await c.env.DB.prepare(
    `INSERT INTO application_tags (application_id, tag_id)
     VALUES (?, ?) ON CONFLICT DO NOTHING`,
  )
    .bind(c.req.param("id"), tag!.id)
    .run();
  return c.json(tag, 201);
});

app.delete("/api/applications/:id/tags/:tagId", async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM application_tags WHERE application_id = ? AND tag_id = ?",
  )
    .bind(c.req.param("id"), c.req.param("tagId"))
    .run();
  return c.body(null, 204);
});

app.post("/api/applications", async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO applications (company_id, contact_id, title, role_type, url, source, salary_range, status, notes, applied_at, next_action, next_action_at, deadline_at, fit_score, salary_currency, salary_min, salary_max, salary_period, signing_bonus, bonus_target_pct, equity_value, benefits_notes, referred_by_contact_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
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
      body.salary_currency ?? null,
      body.salary_min ?? null,
      body.salary_max ?? null,
      body.salary_period ?? null,
      body.signing_bonus ?? null,
      body.bonus_target_pct ?? null,
      body.equity_value ?? null,
      body.benefits_notes ?? null,
      body.referred_by_contact_id ?? null,
    )
    .first();
  await c.env.DB.prepare(
    `INSERT INTO status_history (application_id, from_status, to_status) VALUES (?, NULL, ?)`,
  )
    .bind((result as { id: number }).id, (result as { status: string }).status)
    .run();
  return c.json(result, 201);
});

app.post("/api/applications/:id/archive", async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE applications SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? RETURNING *`,
  )
    .bind(c.req.param("id"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.post("/api/applications/:id/unarchive", async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE applications SET archived_at = NULL, updated_at = datetime('now')
     WHERE id = ? RETURNING *`,
  )
    .bind(c.req.param("id"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.put("/api/applications/:id", async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const existing = await c.env.DB.prepare(
    "SELECT status FROM applications WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ status: string }>();
  if (!existing) return c.json({ error: "not found" }, 404);
  const result = await c.env.DB.prepare(
    `UPDATE applications
     SET company_id = ?, contact_id = ?, title = ?, role_type = ?, url = ?, source = ?,
         salary_range = ?, status = ?, notes = ?, applied_at = ?, next_action = ?, next_action_at = ?,
         deadline_at = ?, fit_score = ?,
         salary_currency = ?, salary_min = ?, salary_max = ?, salary_period = ?,
         signing_bonus = ?, bonus_target_pct = ?, equity_value = ?, benefits_notes = ?,
         referred_by_contact_id = ?,
         updated_at = datetime('now')
     WHERE id = ? RETURNING *`,
  )
    .bind(
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
      body.salary_currency ?? null,
      body.salary_min ?? null,
      body.salary_max ?? null,
      body.salary_period ?? null,
      body.signing_bonus ?? null,
      body.bonus_target_pct ?? null,
      body.equity_value ?? null,
      body.benefits_notes ?? null,
      body.referred_by_contact_id ?? null,
      c.req.param("id"),
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  const newStatus = (result as { status: string }).status;
  if (newStatus !== existing.status) {
    await c.env.DB.prepare(
      `INSERT INTO status_history (application_id, from_status, to_status) VALUES (?, ?, ?)`,
    )
      .bind(c.req.param("id"), existing.status, newStatus)
      .run();
  }
  return c.json(result);
});

app.patch("/api/applications/:id/status", async (c) => {
  const body = await c.req.json();
  if (!body.status) return c.json({ error: "status is required" }, 400);
  const existing = await c.env.DB.prepare(
    "SELECT status FROM applications WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ status: string }>();
  if (!existing) return c.json({ error: "not found" }, 404);
  const result = await c.env.DB.prepare(
    `UPDATE applications SET status = ?, updated_at = datetime('now')
     WHERE id = ? RETURNING *`,
  )
    .bind(body.status, c.req.param("id"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  if (body.status !== existing.status) {
    await c.env.DB.prepare(
      `INSERT INTO status_history (application_id, from_status, to_status) VALUES (?, ?, ?)`,
    )
      .bind(c.req.param("id"), existing.status, body.status)
      .run();
  }
  return c.json(result);
});

app.delete("/api/applications/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM applications WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.body(null, 204);
});

// --- Interactions ---

app.get("/api/applications/:id/interactions", async (c) => {
  // Includes interactions logged directly on the application's linked
  // contact, flagged via_contact so the UI can mark them.
  const { results } = await c.env.DB.prepare(
    `SELECT i.*, CASE WHEN i.application_id IS NULL THEN 1 ELSE 0 END AS via_contact
     FROM interactions i
     WHERE i.application_id = ?1
        OR (i.application_id IS NULL
            AND i.contact_id = (SELECT contact_id FROM applications WHERE id = ?1))
     ORDER BY i.happened_at DESC, i.id DESC`,
  )
    .bind(c.req.param("id"))
    .all();
  return c.json(results);
});

app.post("/api/applications/:id/interactions", async (c) => {
  const body = await c.req.json();
  const result = await c.env.DB.prepare(
    `INSERT INTO interactions (application_id, type, happened_at, notes)
     VALUES (?, ?, coalesce(?, date('now')), ?) RETURNING *`,
  )
    .bind(
      c.req.param("id"),
      body.type ?? "other",
      body.happened_at ?? null,
      body.notes ?? null,
    )
    .first();
  return c.json(result, 201);
});

app.get("/api/contacts/:id/interactions", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.*, 0 AS via_contact FROM interactions i WHERE i.contact_id = ?
     ORDER BY i.happened_at DESC, i.id DESC`,
  )
    .bind(c.req.param("id"))
    .all();
  return c.json(results);
});

app.post("/api/contacts/:id/interactions", async (c) => {
  const body = await c.req.json();
  const result = await c.env.DB.prepare(
    `INSERT INTO interactions (contact_id, type, happened_at, notes)
     VALUES (?, ?, coalesce(?, date('now')), ?) RETURNING *`,
  )
    .bind(
      c.req.param("id"),
      body.type ?? "other",
      body.happened_at ?? null,
      body.notes ?? null,
    )
    .first();
  return c.json(result, 201);
});

app.delete("/api/interactions/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM interactions WHERE id = ?")
    .bind(c.req.param("id"))
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
] as const;

app.get("/api/export", async (c) => {
  const dump: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM ${table}`,
    ).all();
    dump[table] = results;
  }
  return c.json(
    { exported_at: new Date().toISOString(), ...dump },
    200,
    {
      "Content-Disposition": `attachment; filename="jobseekr-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  );
});

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
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
  const { results } = await c.env.DB.prepare(`SELECT * FROM ${table}`).all();
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

  let html: string;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
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
  const [dueRes, interactionsRes, appliedRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT applications.id, applications.title, applications.next_action AS label,
              applications.next_action_at AS date, companies.name AS company_name
       FROM applications
       LEFT JOIN companies ON companies.id = applications.company_id
       WHERE applications.next_action_at IS NOT NULL
         AND applications.status NOT IN ('rejected', 'withdrawn', 'ghosted')`,
    ).all(),
    c.env.DB.prepare(
      `SELECT interactions.id, interactions.type, interactions.happened_at AS date,
              interactions.notes,
              applications.id AS application_id, applications.title,
              companies.name AS company_name, contacts.name AS contact_name
       FROM interactions
       LEFT JOIN applications ON applications.id = interactions.application_id
       LEFT JOIN companies ON companies.id = applications.company_id
       LEFT JOIN contacts ON contacts.id = COALESCE(interactions.contact_id, applications.contact_id)
       WHERE interactions.happened_at >= date('now', '-14 days')`,
    ).all(),
    c.env.DB.prepare(
      `SELECT applications.id, applications.title, applications.applied_at AS date,
              companies.name AS company_name
       FROM applications
       LEFT JOIN companies ON companies.id = applications.company_id
       WHERE applications.applied_at IS NOT NULL`,
    ).all(),
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

// --- Stats ---

app.get("/api/stats", async (c) => {
  const [apps, history] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, status, source, applied_at, created_at FROM applications",
    ).all(),
    c.env.DB.prepare(
      `SELECT application_id, from_status, to_status, changed_at
       FROM status_history ORDER BY application_id, changed_at, id`,
    ).all(),
  ]);
  return c.json({ applications: apps.results, history: history.results });
});

// --- Public share link (#113) ---
// A single unauthenticated route gated by an unguessable token, showing
// aggregate Stats only (no per-application detail, no edit capability).
// NOTE: this route is reachable by anyone with the token — it must also
// be excluded from the Cloudflare Access policy that otherwise protects
// every route in this Worker, which is a dashboard/zone-level change
// outside this repo and has to be done by whoever administers Access.

app.post("/api/profile/share-token", async (c) => {
  const token = crypto.randomUUID();
  await c.env.DB.prepare("UPDATE profile SET share_token = ? WHERE id = 1")
    .bind(token)
    .run();
  return c.json({ share_token: token });
});

app.delete("/api/profile/share-token", async (c) => {
  await c.env.DB.prepare("UPDATE profile SET share_token = NULL WHERE id = 1").run();
  return c.body(null, 204);
});

const SHARE_PIPELINE = ["interested", "applied", "screening", "interview", "offer"];

function shareParseSqlDate(d: string): number {
  return new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z").getTime();
}

app.get("/shared/:token", async (c) => {
  const token = c.req.param("token");
  const profile = await c.env.DB.prepare(
    "SELECT id FROM profile WHERE id = 1 AND share_token = ?",
  )
    .bind(token)
    .first();
  if (!profile) return c.text("Not found", 404);

  const [apps, history] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, status, applied_at, created_at FROM applications",
    ).all<{ id: number; status: string; applied_at: string | null; created_at: string }>(),
    c.env.DB.prepare(
      `SELECT application_id, from_status, to_status, changed_at
       FROM status_history ORDER BY application_id, changed_at, id`,
    ).all<{
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
     FROM documents WHERE application_id = ? ORDER BY created_at DESC`,
  )
    .bind(c.req.param("id"))
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
  const appId = c.req.param("id");
  const contentType =
    c.req.header("Content-Type") ?? "application/octet-stream";
  const key = `app-${appId}/${Date.now()}-${filename}`;
  await c.env.DOCS.put(key, c.req.raw.body, {
    httpMetadata: { contentType },
  });
  const result = await c.env.DB.prepare(
    `INSERT INTO documents (application_id, key, filename, label, size, content_type)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id, application_id, filename, label, size, content_type, created_at`,
  )
    .bind(appId, key, filename, c.req.query("label") ?? null, size, contentType)
    .first();
  return c.json(result, 201);
});

app.get("/api/documents/:id/download", async (c) => {
  const doc = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?")
    .bind(c.req.param("id"))
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
  const doc = await c.env.DB.prepare("SELECT key FROM documents WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ key: string }>();
  if (doc) {
    await c.env.DOCS.delete(doc.key);
    await c.env.DB.prepare("DELETE FROM documents WHERE id = ?")
      .bind(c.req.param("id"))
      .run();
  }
  return c.body(null, 204);
});

registerFeedRoutes(app);
registerRoleTypeRoutes(app);
registerCvRoutes(app);

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
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

  const contact = await env.DB.prepare(
    "SELECT id, outreach_status FROM contacts WHERE lower(email) = ?",
  )
    .bind(fromAddress)
    .first<{ id: number; outreach_status: string }>();
  if (!contact) return;

  await env.DB.prepare(
    `INSERT INTO interactions (contact_id, type, notes) VALUES (?, 'email', ?)`,
  )
    .bind(contact.id, subject)
    .run();

  if (contact.outreach_status === "awaiting_reply") {
    await env.DB.prepare(
      "UPDATE contacts SET outreach_status = 'replied' WHERE id = ?",
    )
      .bind(contact.id)
      .run();
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshFeed(env));
    ctx.waitUntil(checkStalePostings(env));
  },
  async email(message, env, ctx) {
    const subject = message.headers.get("subject") ?? "(no subject)";
    ctx.waitUntil(logInboundEmail(env, message.from, subject));
  },
} satisfies ExportedHandler<Env>;
