import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

// Weekly job-search goal (#473). One row per user, auto-created with a default
// on first read. The dashboard derives streak + progress from the application
// history; only the target and (optional) search start live here.
export function registerGoalRoutes(app: Hono<AppEnv>) {
  app.get("/api/goals", async (c) => {
    const userId = c.get("userId");
    let row = await c.env.DB.prepare(
      "SELECT * FROM user_goals WHERE user_id = ?",
    )
      .bind(userId)
      .first();
    if (!row) {
      row = await c.env.DB.prepare(
        "INSERT INTO user_goals (user_id) VALUES (?) RETURNING *",
      )
        .bind(userId)
        .first();
    }
    return c.json(row);
  });

  app.put("/api/goals", async (c) => {
    const body = await c.req.json();
    // Clamp to a sane range; 0 disables the goal.
    const goal = Math.max(0, Math.min(50, Math.round(Number(body.weekly_app_goal) || 0)));
    const start =
      typeof body.search_started_at === "string" && body.search_started_at
        ? body.search_started_at
        : null;
    const row = await c.env.DB.prepare(
      `INSERT INTO user_goals (user_id, weekly_app_goal, search_started_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         weekly_app_goal = excluded.weekly_app_goal,
         search_started_at = excluded.search_started_at
       RETURNING *`,
    )
      .bind(c.get("userId"), goal, start)
      .first();
    return c.json(row);
  });
}
