import { Hono } from "hono";

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
    `INSERT INTO applications (company_id, contact_id, title, role_type, url, source, salary_range, status, notes, applied_at, next_action, next_action_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
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
    )
    .first();
  return c.json(result, 201);
});

app.put("/api/applications/:id", async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE applications
     SET company_id = ?, contact_id = ?, title = ?, role_type = ?, url = ?, source = ?,
         salary_range = ?, status = ?, notes = ?, applied_at = ?, next_action = ?, next_action_at = ?,
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
      c.req.param("id"),
    )
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.patch("/api/applications/:id/status", async (c) => {
  const body = await c.req.json();
  if (!body.status) return c.json({ error: "status is required" }, 400);
  const result = await c.env.DB.prepare(
    `UPDATE applications SET status = ?, updated_at = datetime('now')
     WHERE id = ? RETURNING *`,
  )
    .bind(body.status, c.req.param("id"))
    .first();
  if (!result) return c.json({ error: "not found" }, 404);
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

// --- Stats ---

app.get("/api/stats", async (c) => {
  const [apps, history] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, status, source, created_at FROM applications",
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

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
  if (err.message.includes("CHECK constraint failed")) {
    return c.json({ error: "invalid value" }, 400);
  }
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
