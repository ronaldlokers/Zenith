import { Hono } from "hono";
import { refreshFeed, registerFeedRoutes } from "./feed.js";
import { registerRoleTypeRoutes } from "./role-types.js";

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
    `INSERT INTO contacts (company_id, name, role, email, phone, linkedin, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      body.company_id ?? null,
      body.name,
      body.role ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.linkedin ?? null,
      body.notes ?? null,
    )
    .first();
  return c.json(result, 201);
});

app.put("/api/contacts/:id", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE contacts SET company_id = ?, name = ?, role = ?, email = ?, phone = ?, linkedin = ?, notes = ?
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
    `SELECT applications.*, companies.name AS company_name, contacts.name AS contact_name
     FROM applications
     LEFT JOIN companies ON companies.id = applications.company_id
     LEFT JOIN contacts ON contacts.id = applications.contact_id
     ORDER BY applications.updated_at DESC`,
  ).all();
  return c.json(results);
});

app.post("/api/applications", async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO applications (company_id, contact_id, title, role_type, url, source, salary_range, status, notes, applied_at, next_action, next_action_at, salary_currency, salary_min, salary_max, salary_period)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
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
      body.salary_currency ?? null,
      body.salary_min ?? null,
      body.salary_max ?? null,
      body.salary_period ?? null,
    )
    .first();
  await c.env.DB.prepare(
    `INSERT INTO status_history (application_id, from_status, to_status) VALUES (?, NULL, ?)`,
  )
    .bind((result as { id: number }).id, (result as { status: string }).status)
    .run();
  return c.json(result, 201);
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
         salary_currency = ?, salary_min = ?, salary_max = ?, salary_period = ?,
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
      body.salary_currency ?? null,
      body.salary_min ?? null,
      body.salary_max ?? null,
      body.salary_period ?? null,
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

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshFeed(env));
  },
} satisfies ExportedHandler<Env>;
