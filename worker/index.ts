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

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
  if (err.message.includes("CHECK constraint failed")) {
    return c.json({ error: "invalid value" }, 400);
  }
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
