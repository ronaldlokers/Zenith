import type { Hono } from "hono";

export function registerCvRoutes(app: Hono<{ Bindings: Env }>) {
  // --- Profile (singleton) ---

  app.get("/api/profile", async (c) => {
    const result = await c.env.DB.prepare(
      "SELECT * FROM profile WHERE id = 1",
    ).first();
    return c.json(result);
  });

  app.put("/api/profile", async (c) => {
    const body = await c.req.json();
    const result = await c.env.DB.prepare(
      `UPDATE profile SET name = ?, email = ?, phone = ?, location = ?,
         linkedin = ?, github = ?, portfolio = ?, summary = ?
       WHERE id = 1 RETURNING *`,
    )
      .bind(
        body.name ?? null,
        body.email ?? null,
        body.phone ?? null,
        body.location ?? null,
        body.linkedin ?? null,
        body.github ?? null,
        body.portfolio ?? null,
        body.summary ?? null,
      )
      .first();
    return c.json(result);
  });

  // --- Skills ---

  app.get("/api/skills", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM skills ORDER BY name",
    ).all();
    return c.json(results);
  });

  // --- Work experience ---

  app.get("/api/work-experience", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM work_experience ORDER BY sort_order, id",
    ).all<{ id: number }>();
    const { results: links } = await c.env.DB.prepare(
      `SELECT work_experience_skills.work_experience_id, skills.id, skills.name
       FROM work_experience_skills
       JOIN skills ON skills.id = work_experience_skills.skill_id`,
    ).all<{ work_experience_id: number; id: number; name: string }>();
    const withSkills = results.map((w) => ({
      ...w,
      skills: links
        .filter((l) => l.work_experience_id === w.id)
        .map((l) => ({ id: l.id, name: l.name })),
    }));
    return c.json(withSkills);
  });

  app.post("/api/work-experience", async (c) => {
    const body = await c.req.json();
    if (!body.company || !body.title) {
      return c.json({ error: "company and title are required" }, 400);
    }
    const maxOrder = await c.env.DB.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM work_experience",
    ).first<{ m: number }>();
    const result = await c.env.DB.prepare(
      `INSERT INTO work_experience (company, title, description, start_month, start_year, end_month, end_year, is_current, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(
        body.company,
        body.title,
        body.description ?? null,
        body.start_month ?? null,
        body.start_year ?? null,
        body.end_month ?? null,
        body.end_year ?? null,
        body.is_current ? 1 : 0,
        (maxOrder?.m ?? -1) + 1,
      )
      .first();
    return c.json({ ...(result as object), skills: [] }, 201);
  });

  app.put("/api/work-experience/:id", async (c) => {
    const body = await c.req.json();
    if (!body.company || !body.title) {
      return c.json({ error: "company and title are required" }, 400);
    }
    const result = await c.env.DB.prepare(
      `UPDATE work_experience
       SET company = ?, title = ?, description = ?, start_month = ?, start_year = ?,
           end_month = ?, end_year = ?, is_current = ?, sort_order = COALESCE(?, sort_order)
       WHERE id = ? RETURNING *`,
    )
      .bind(
        body.company,
        body.title,
        body.description ?? null,
        body.start_month ?? null,
        body.start_year ?? null,
        body.end_month ?? null,
        body.end_year ?? null,
        body.is_current ? 1 : 0,
        body.sort_order ?? null,
        c.req.param("id"),
      )
      .first();
    if (!result) return c.json({ error: "not found" }, 404);
    return c.json(result);
  });

  app.delete("/api/work-experience/:id", async (c) => {
    await c.env.DB.prepare("DELETE FROM work_experience WHERE id = ?")
      .bind(c.req.param("id"))
      .run();
    return c.body(null, 204);
  });

  // Find-or-create the skill by (case-insensitive) name, then link it —
  // mirrors the role_types find-or-create-by-label pattern from #45,
  // so retyping "TypeScript" always reuses the same skill row.
  app.post("/api/work-experience/:id/skills", async (c) => {
    const body = await c.req.json();
    const name = (body.name ?? "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);

    let skill = await c.env.DB.prepare(
      "SELECT * FROM skills WHERE name = ? COLLATE NOCASE",
    )
      .bind(name)
      .first<{ id: number; name: string }>();
    if (!skill) {
      skill = await c.env.DB.prepare(
        "INSERT INTO skills (name) VALUES (?) RETURNING *",
      )
        .bind(name)
        .first<{ id: number; name: string }>();
    }
    await c.env.DB.prepare(
      `INSERT INTO work_experience_skills (work_experience_id, skill_id)
       VALUES (?, ?) ON CONFLICT DO NOTHING`,
    )
      .bind(c.req.param("id"), skill!.id)
      .run();
    return c.json(skill, 201);
  });

  app.delete("/api/work-experience/:id/skills/:skillId", async (c) => {
    await c.env.DB.prepare(
      "DELETE FROM work_experience_skills WHERE work_experience_id = ? AND skill_id = ?",
    )
      .bind(c.req.param("id"), c.req.param("skillId"))
      .run();
    return c.body(null, 204);
  });

  // --- Education ---

  app.get("/api/education", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM education ORDER BY sort_order, id",
    ).all();
    return c.json(results);
  });

  app.post("/api/education", async (c) => {
    const body = await c.req.json();
    if (!body.institution) {
      return c.json({ error: "institution is required" }, 400);
    }
    const maxOrder = await c.env.DB.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM education",
    ).first<{ m: number }>();
    const result = await c.env.DB.prepare(
      `INSERT INTO education (institution, degree, field, start_month, start_year, end_month, end_year, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(
        body.institution,
        body.degree ?? null,
        body.field ?? null,
        body.start_month ?? null,
        body.start_year ?? null,
        body.end_month ?? null,
        body.end_year ?? null,
        (maxOrder?.m ?? -1) + 1,
      )
      .first();
    return c.json(result, 201);
  });

  app.put("/api/education/:id", async (c) => {
    const body = await c.req.json();
    if (!body.institution) {
      return c.json({ error: "institution is required" }, 400);
    }
    const result = await c.env.DB.prepare(
      `UPDATE education
       SET institution = ?, degree = ?, field = ?, start_month = ?, start_year = ?,
           end_month = ?, end_year = ?, sort_order = COALESCE(?, sort_order)
       WHERE id = ? RETURNING *`,
    )
      .bind(
        body.institution,
        body.degree ?? null,
        body.field ?? null,
        body.start_month ?? null,
        body.start_year ?? null,
        body.end_month ?? null,
        body.end_year ?? null,
        body.sort_order ?? null,
        c.req.param("id"),
      )
      .first();
    if (!result) return c.json({ error: "not found" }, 404);
    return c.json(result);
  });

  app.delete("/api/education/:id", async (c) => {
    await c.env.DB.prepare("DELETE FROM education WHERE id = ?")
      .bind(c.req.param("id"))
      .run();
    return c.body(null, 204);
  });

  // --- Languages ---

  app.get("/api/languages", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM languages ORDER BY id",
    ).all();
    return c.json(results);
  });

  app.post("/api/languages", async (c) => {
    const body = await c.req.json();
    if (!body.name || !body.proficiency) {
      return c.json({ error: "name and proficiency are required" }, 400);
    }
    const result = await c.env.DB.prepare(
      "INSERT INTO languages (name, proficiency) VALUES (?, ?) RETURNING *",
    )
      .bind(body.name, body.proficiency)
      .first();
    return c.json(result, 201);
  });

  app.delete("/api/languages/:id", async (c) => {
    await c.env.DB.prepare("DELETE FROM languages WHERE id = ?")
      .bind(c.req.param("id"))
      .run();
    return c.body(null, 204);
  });
}
