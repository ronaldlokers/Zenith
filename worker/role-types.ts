import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

// Slugs the rest of the app has already spoken for. "all" is the board's
// "no role filter" sentinel and "other" is the fallback role_type an
// application carries when none is set, so a role type owning either slug is
// a row that cannot be filtered to: picking it clears the filter instead.
//
// Measured before this: creating a role type called "All" returned 201 with
// the slug "all", and that role was then unfilterable on the board.
//
// Suffixed rather than refused. The slug is internal — the label is what
// anyone sees, and it is kept exactly as typed — so there is nothing to
// explain and no reason to make someone rename a perfectly good role.
const RESERVED_SLUGS = new Set(["all", "other"]);

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function registerRoleTypeRoutes(app: Hono<AppEnv>) {
  app.get("/api/role-types", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM role_types WHERE user_id = ? ORDER BY sort_order, id",
    )
      .bind(c.get("userId"))
      .all();
    return c.json(results);
  });

  app.post("/api/role-types", async (c) => {
    const body = await c.req.json();
    if (!body.label) return c.json({ error: "label is required" }, 400);
    const base = body.slug ? slugify(body.slug) : slugify(body.label);
    if (!base) return c.json({ error: "label must contain letters or numbers" }, 400);
    const userId = c.get("userId");
    // Only reserved slugs are stepped past here. A slug that simply exists
    // already still conflicts, which is the existing 409 and the right answer
    // — two role types with the same name is a mistake worth reporting, not
    // one to paper over with a suffix.
    let slug = base;
    for (let n = 2; RESERVED_SLUGS.has(slug); n++) slug = `${base}-${n}`;
    const maxOrder = await c.env.DB.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM role_types WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ m: number }>();
    const result = await c.env.DB.prepare(
      `INSERT INTO role_types (user_id, slug, label, sort_order) VALUES (?, ?, ?, ?) RETURNING *`,
    )
      .bind(userId, slug, body.label, (maxOrder?.m ?? -1) + 1)
      .first();
    return c.json(result, 201);
  });

  app.put("/api/role-types/:id", async (c) => {
    const body = await c.req.json();
    if (!body.label) return c.json({ error: "label is required" }, 400);
    const result = await c.env.DB.prepare(
      `UPDATE role_types SET label = ?, sort_order = COALESCE(?, sort_order)
       WHERE id = ? AND user_id = ? RETURNING *`,
    )
      .bind(body.label, body.sort_order ?? null, c.req.param("id"), c.get("userId"))
      .first();
    if (!result) return c.json({ error: "not found" }, 404);
    return c.json(result);
  });

  app.delete("/api/role-types/:id", async (c) => {
    const userId = c.get("userId");
    const role = await c.env.DB.prepare(
      "SELECT slug FROM role_types WHERE id = ? AND user_id = ?",
    )
      .bind(c.req.param("id"), userId)
      .first<{ slug: string }>();
    if (role) {
      await c.env.DB.prepare("DELETE FROM role_types WHERE id = ? AND user_id = ?")
        .bind(c.req.param("id"), userId)
        .run();
      await c.env.DB.prepare("DELETE FROM feed_role_keywords WHERE role_slug = ? AND user_id = ?")
        .bind(role.slug, userId)
        .run();
    }
    return c.body(null, 204);
  });
}
