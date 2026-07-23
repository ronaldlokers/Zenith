import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

// Outreach message templates (#472) — per-user reusable bodies with
// {{placeholders}}. Plain CRUD scoped by user_id, mirroring the other simple
// resources (e.g. languages in cv.ts). Substitution happens client-side when
// composing, so the server just stores the raw body.
export function registerOutreachRoutes(app: Hono<AppEnv>) {
  app.get("/api/outreach-templates", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM outreach_templates WHERE user_id = ? ORDER BY sort_order, id",
    )
      .bind(c.get("userId"))
      .all();
    return c.json(results);
  });

  app.post("/api/outreach-templates", async (c) => {
    const body = await c.req.json();
    const name = (body.name ?? "").trim();
    const text = (body.body ?? "").trim();
    if (!name || !text) {
      return c.json({ error: "name and body are required" }, 400);
    }
    const result = await c.env.DB.prepare(
      "INSERT INTO outreach_templates (user_id, name, body, sort_order) VALUES (?, ?, ?, ?) RETURNING *",
    )
      .bind(c.get("userId"), name, text, Number(body.sort_order) || 0)
      .first();
    return c.json(result, 201);
  });

  app.put("/api/outreach-templates/:id", async (c) => {
    const body = await c.req.json();
    const name = (body.name ?? "").trim();
    const text = (body.body ?? "").trim();
    if (!name || !text) {
      return c.json({ error: "name and body are required" }, 400);
    }
    const result = await c.env.DB.prepare(
      "UPDATE outreach_templates SET name = ?, body = ? WHERE id = ? AND user_id = ? RETURNING *",
    )
      .bind(name, text, c.req.param("id"), c.get("userId"))
      .first();
    if (!result) return c.json({ error: "not found" }, 404);
    return c.json(result);
  });

  app.delete("/api/outreach-templates/:id", async (c) => {
    await c.env.DB.prepare(
      "DELETE FROM outreach_templates WHERE id = ? AND user_id = ?",
    )
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });
}
