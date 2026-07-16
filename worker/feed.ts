import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

// Free job-source ingestion. See issue #16/#34 for the research behind
// this source list — Indeed and LinkedIn have no usable public API.
// Role keywords and location filters are configured in the DB
// (feed_role_keywords / feed_sources, migration 0010, made per-user in
// 0024) rather than hardcoded, so they can be tuned from the Feed tab
// without a deploy.
//
// feed_items itself stays a single shared pool across all users (#38):
// re-running these external, rate-limited fetches once per user would
// multiply API calls (Adzuna's free tier in particular) for no benefit.
// The cron run below aggregates every user's keywords and (source,
// location) combinations, fetches each distinct combination once, and
// tags each item with the role_type slug that matched. Per-user
// new/dismissed/added state lives in feed_item_status instead of a
// column on feed_items.

interface RoleKeywords {
  [roleSlug: string]: string[];
}

async function loadRoleKeywords(env: Env): Promise<RoleKeywords> {
  // Aggregated across all users — feed content isn't sensitive, so
  // searching the union of everyone's keywords (then letting each user's
  // own /api/feed view filter down to their own role_types) gives
  // broader coverage without extra fetches per user.
  const { results } = await env.DB.prepare(
    "SELECT role_slug, keyword FROM feed_role_keywords",
  ).all<{ role_slug: string; keyword: string }>();
  const map: RoleKeywords = {};
  for (const row of results) {
    (map[row.role_slug] ??= []).push(row.keyword.toLowerCase());
  }
  return map;
}

interface SourceConfig {
  source: string;
  location: string | null;
}

async function loadDistinctSourceConfigs(env: Env): Promise<SourceConfig[]> {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT source, location FROM feed_sources WHERE enabled = 1",
  ).all<{ source: string; location: string | null }>();
  return results;
}

function guessRoleType(text: string, keywords: RoleKeywords): string | null {
  const lower = text.toLowerCase();
  for (const [role, kws] of Object.entries(keywords)) {
    if (kws.some((k) => lower.includes(k))) return role;
  }
  return null;
}

interface FeedCandidate {
  source: "adzuna" | "hn" | "arbeitnow";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  salary_text: string | null;
  role_type: string;
  posted_at: string | null;
}

async function fetchAdzuna(
  env: Env,
  keywords: RoleKeywords,
  country: string | null,
): Promise<FeedCandidate[]> {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return [];
  const out: FeedCandidate[] = [];
  const countryCode = (country || "nl").toLowerCase();
  for (const [role, kws] of Object.entries(keywords)) {
    if (kws.length === 0) continue;
    const query = kws[0];
    const url =
      `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/1` +
      `?app_id=${env.ADZUNA_APP_ID}&app_key=${env.ADZUNA_APP_KEY}` +
      `&results_per_page=10&what=${encodeURIComponent(query)}&content-type=application/json`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: Array<{
          id: string;
          title: string;
          company?: { display_name?: string };
          location?: { display_name?: string };
          redirect_url?: string;
          salary_min?: number;
          salary_max?: number;
          created?: string;
        }>;
      };
      for (const job of data.results ?? []) {
        out.push({
          source: "adzuna",
          external_id: job.id,
          title: job.title,
          company: job.company?.display_name ?? null,
          location: job.location?.display_name ?? null,
          url: job.redirect_url ?? null,
          salary_text:
            job.salary_min && job.salary_max
              ? `€${Math.round(job.salary_min)}-${Math.round(job.salary_max)}`
              : null,
          role_type: role,
          posted_at: job.created ?? null,
        });
      }
    } catch {
      // best effort per source
    }
  }
  return out;
}

async function fetchHnWhoIsHiring(
  keywords: RoleKeywords,
  locationFilter: string | null,
): Promise<FeedCandidate[]> {
  try {
    const storyRes = await fetch(
      "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Who%20is%20Hiring&hitsPerPage=1",
    );
    if (!storyRes.ok) return [];
    const storyData = (await storyRes.json()) as {
      hits: Array<{ objectID: string; created_at: string }>;
    };
    const story = storyData.hits[0];
    if (!story) return [];

    const commentsRes = await fetch(
      `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${story.objectID}&hitsPerPage=500`,
    );
    if (!commentsRes.ok) return [];
    const commentsData = (await commentsRes.json()) as {
      hits: Array<{ objectID: string; comment_text: string | null; created_at: string }>;
    };

    const out: FeedCandidate[] = [];
    const locNeedle = locationFilter?.toLowerCase() ?? null;
    for (const hit of commentsData.hits) {
      const text = hit.comment_text ?? "";
      if (locNeedle && !text.toLowerCase().includes(locNeedle)) continue;
      const firstLine = text.split(/<p>|\n/)[0].replace(/<[^>]+>/g, "");
      const role = guessRoleType(text, keywords);
      if (!role) continue;
      out.push({
        source: "hn",
        external_id: hit.objectID,
        title: firstLine.slice(0, 140) || "HN Who's Hiring listing",
        company: null,
        location: null,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        salary_text: null,
        role_type: role,
        posted_at: hit.created_at,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchArbeitnow(
  keywords: RoleKeywords,
  locationFilter: string | null,
): Promise<FeedCandidate[]> {
  try {
    const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data: Array<{
        slug: string;
        title: string;
        company_name?: string;
        location?: string;
        url?: string;
        tags?: string[];
        created_at?: number;
      }>;
    };
    const out: FeedCandidate[] = [];
    const locNeedle = locationFilter?.toLowerCase() ?? null;
    for (const job of data.data) {
      if (
        locNeedle &&
        !(job.location ?? "").toLowerCase().includes(locNeedle)
      ) {
        continue;
      }
      const role = guessRoleType(`${job.title} ${(job.tags ?? []).join(" ")}`, keywords);
      if (!role) continue;
      out.push({
        source: "arbeitnow",
        external_id: job.slug,
        title: job.title,
        company: job.company_name ?? null,
        location: job.location ?? null,
        url: job.url ?? null,
        salary_text: null,
        role_type: role,
        posted_at: job.created_at
          ? new Date(job.created_at * 1000).toISOString()
          : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function refreshFeed(env: Env): Promise<{ inserted: number; seen: number }> {
  const [keywords, configs] = await Promise.all([
    loadRoleKeywords(env),
    loadDistinctSourceConfigs(env),
  ]);

  const jobs: Promise<FeedCandidate[]>[] = [];
  for (const cfg of configs.filter((c) => c.source === "adzuna")) {
    jobs.push(fetchAdzuna(env, keywords, cfg.location));
  }
  for (const cfg of configs.filter((c) => c.source === "hn")) {
    jobs.push(fetchHnWhoIsHiring(keywords, cfg.location));
  }
  for (const cfg of configs.filter((c) => c.source === "arbeitnow")) {
    jobs.push(fetchArbeitnow(keywords, cfg.location));
  }
  const candidates = (await Promise.all(jobs)).flat();

  let inserted = 0;
  for (const c of candidates) {
    const result = await env.DB.prepare(
      `INSERT INTO feed_items (source, external_id, title, company, location, url, salary_text, role_type, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, external_id) DO NOTHING`,
    )
      .bind(
        c.source,
        c.external_id,
        c.title,
        c.company,
        c.location,
        c.url,
        c.salary_text,
        c.role_type,
        c.posted_at,
      )
      .run();
    if (result.meta.changes > 0) inserted++;
  }
  return { inserted, seen: candidates.length };
}

export function registerFeedRoutes(app: Hono<AppEnv>) {
  app.get("/api/feed", async (c) => {
    const userId = c.get("userId");
    // A feed_item is "new" for this user unless a feed_item_status row
    // says otherwise (dismissed/added) — that row only exists once the
    // user has acted on it.
    const { results } = await c.env.DB.prepare(
      `SELECT feed_items.*
       FROM feed_items
       LEFT JOIN feed_item_status
         ON feed_item_status.feed_item_id = feed_items.id
         AND feed_item_status.user_id = ?
       WHERE COALESCE(feed_item_status.status, 'new') = 'new'
       ORDER BY feed_items.posted_at DESC, feed_items.id DESC`,
    )
      .bind(userId)
      .all();
    return c.json(results);
  });

  // Manual trigger for testing/on-demand refresh (cron does this automatically)
  app.post("/api/feed/refresh", async (c) => {
    const result = await refreshFeed(c.env);
    return c.json(result);
  });

  app.post("/api/feed/:id/dismiss", async (c) => {
    await c.env.DB.prepare(
      `INSERT INTO feed_item_status (feed_item_id, user_id, status)
       VALUES (?, ?, 'dismissed')
       ON CONFLICT (feed_item_id, user_id) DO UPDATE SET status = 'dismissed'`,
    )
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  app.post("/api/feed/:id/add", async (c) => {
    const userId = c.get("userId");
    const item = await c.env.DB.prepare("SELECT * FROM feed_items WHERE id = ?")
      .bind(c.req.param("id"))
      .first<{
        title: string;
        company: string | null;
        url: string | null;
        salary_text: string | null;
        role_type: string;
        source: string;
      }>();
    if (!item) return c.json({ error: "not found" }, 404);

    let companyId: number | null = null;
    if (item.company) {
      const existing = await c.env.DB.prepare(
        "SELECT id FROM companies WHERE lower(name) = lower(?) AND user_id = ?",
      )
        .bind(item.company, userId)
        .first<{ id: number }>();
      if (existing) {
        companyId = existing.id;
      } else {
        const created = await c.env.DB.prepare(
          "INSERT INTO companies (user_id, name) VALUES (?, ?) RETURNING id",
        )
          .bind(userId, item.company)
          .first<{ id: number }>();
        companyId = created?.id ?? null;
      }
    }

    const application = await c.env.DB.prepare(
      `INSERT INTO applications (user_id, company_id, title, role_type, url, source, salary_range, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'interested') RETURNING *`,
    )
      .bind(
        userId,
        companyId,
        item.title,
        item.role_type,
        item.url,
        `feed:${item.source}`,
        item.salary_text,
      )
      .first();

    await c.env.DB.prepare(
      `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES (?, ?, NULL, 'interested')`,
    )
      .bind((application as { id: number }).id, userId)
      .run();

    await c.env.DB.prepare(
      `INSERT INTO feed_item_status (feed_item_id, user_id, status)
       VALUES (?, ?, 'added')
       ON CONFLICT (feed_item_id, user_id) DO UPDATE SET status = 'added'`,
    )
      .bind(c.req.param("id"), userId)
      .run();

    return c.json(application, 201);
  });

  // --- Feed configuration ---

  app.get("/api/feed/config", async (c) => {
    const userId = c.get("userId");
    const [sources, keywords] = await Promise.all([
      c.env.DB.prepare(
        "SELECT source, enabled, location FROM feed_sources WHERE user_id = ? ORDER BY source",
      )
        .bind(userId)
        .all(),
      c.env.DB.prepare(
        "SELECT id, role_slug, keyword FROM feed_role_keywords WHERE user_id = ? ORDER BY role_slug, keyword",
      )
        .bind(userId)
        .all(),
    ]);
    return c.json({ sources: sources.results, keywords: keywords.results });
  });

  app.put("/api/feed/config/sources/:source", async (c) => {
    const source = c.req.param("source");
    const body = await c.req.json();
    const userId = c.get("userId");
    const result = await c.env.DB.prepare(
      `INSERT INTO feed_sources (user_id, source, enabled, location)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, source) DO UPDATE SET enabled = excluded.enabled, location = excluded.location
       RETURNING *`,
    )
      .bind(userId, source, body.enabled ? 1 : 0, body.location || null)
      .first();
    if (!result) return c.json({ error: "unknown source" }, 404);
    return c.json(result);
  });

  app.post("/api/feed/config/keywords", async (c) => {
    const body = await c.req.json();
    if (!body.role_slug || !body.keyword) {
      return c.json({ error: "role_slug and keyword are required" }, 400);
    }
    const result = await c.env.DB.prepare(
      `INSERT INTO feed_role_keywords (user_id, role_slug, keyword) VALUES (?, ?, ?) RETURNING *`,
    )
      .bind(c.get("userId"), body.role_slug, body.keyword.toLowerCase())
      .first();
    return c.json(result, 201);
  });

  app.delete("/api/feed/config/keywords/:id", async (c) => {
    await c.env.DB.prepare("DELETE FROM feed_role_keywords WHERE id = ? AND user_id = ?")
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });
}
