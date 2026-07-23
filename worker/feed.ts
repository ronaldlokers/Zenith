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

interface AtsBoard {
  source: "greenhouse" | "ashby";
  slug: string;
}

async function loadDistinctAtsBoards(env: Env): Promise<AtsBoard[]> {
  // Aggregated across users like the other source configs — a board
  // any one user asked to watch gets fetched once; board_slug on the
  // stored item is what actually scopes visibility back to that user
  // in GET /api/feed, not this fetch step.
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT source, slug FROM feed_ats_boards",
  ).all<AtsBoard>();
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
  source: "adzuna" | "greenhouse" | "ashby";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  salary_text: string | null;
  role_type: string;
  posted_at: string | null;
  board_slug?: string;
  // The job description, when the provider returns one. Full for Greenhouse
  // (HTML, flattened) and Ashby; a truncated snippet for Adzuna. Carried into
  // an application's job_description on "Add to Jobs".
  description?: string | null;
}

// Greenhouse returns the JD as HTML; flatten it to readable plain text and cap
// the length so a huge posting doesn't bloat the shared feed_items pool.
export function stripHtml(html: string): string {
  const text = html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text.length > 8000 ? text.slice(0, 8000) : text;
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
          description?: string;
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
          // Adzuna returns only a truncated ~200-char snippet.
          description: job.description ?? null,
        });
      }
    } catch {
      // best effort per source
    }
  }
  return out;
}

// Direct ATS sourcing (#219) — Greenhouse and Ashby both publish free,
// keyless public APIs for one company's own job board. No keyword
// filtering: a user who explicitly asked to watch a company's board
// wants everything on it, not a role-guessed subset (role_type still
// gets tagged, best-effort, for consistency with the rest of the feed
// UI, but a miss doesn't drop the listing the way it does for HN).
async function fetchGreenhouse(
  slug: string,
  keywords: RoleKeywords,
): Promise<FeedCandidate[]> {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      jobs?: Array<{
        id: number;
        title: string;
        absolute_url?: string;
        location?: { name?: string };
        updated_at?: string;
        content?: string;
      }>;
    };
    return (data.jobs ?? []).map((job) => ({
      source: "greenhouse" as const,
      external_id: String(job.id),
      title: job.title,
      company: slug,
      location: job.location?.name ?? null,
      url: job.absolute_url ?? null,
      salary_text: null,
      role_type: guessRoleType(job.title, keywords) ?? "other",
      posted_at: job.updated_at ?? null,
      board_slug: slug,
      // ?content=true (already requested) returns the full JD as HTML.
      description: job.content ? stripHtml(job.content) : null,
    }));
  } catch {
    return [];
  }
}

async function fetchAshby(
  slug: string,
  keywords: RoleKeywords,
): Promise<FeedCandidate[]> {
  try {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      jobs?: Array<{
        id: string;
        title: string;
        jobUrl?: string;
        location?: string;
        publishedAt?: string;
        descriptionPlain?: string;
        descriptionHtml?: string;
      }>;
    };
    return (data.jobs ?? []).map((job) => ({
      source: "ashby" as const,
      external_id: job.id,
      title: job.title,
      company: slug,
      location: job.location ?? null,
      url: job.jobUrl ?? null,
      salary_text: null,
      role_type: guessRoleType(job.title, keywords) ?? "other",
      posted_at: job.publishedAt ?? null,
      board_slug: slug,
      // Ashby returns the full description; prefer plain, else flatten HTML.
      description: job.descriptionPlain
        ? job.descriptionPlain.slice(0, 8000)
        : job.descriptionHtml
          ? stripHtml(job.descriptionHtml)
          : null,
    }));
  } catch {
    return [];
  }
}

export async function refreshFeed(env: Env): Promise<{ inserted: number; seen: number }> {
  const [keywords, configs, atsBoards] = await Promise.all([
    loadRoleKeywords(env),
    loadDistinctSourceConfigs(env),
    loadDistinctAtsBoards(env),
  ]);

  const jobs: Promise<FeedCandidate[]>[] = [];
  for (const cfg of configs.filter((c) => c.source === "adzuna")) {
    jobs.push(fetchAdzuna(env, keywords, cfg.location));
  }
  for (const board of atsBoards.filter((b) => b.source === "greenhouse")) {
    jobs.push(fetchGreenhouse(board.slug, keywords));
  }
  for (const board of atsBoards.filter((b) => b.source === "ashby")) {
    jobs.push(fetchAshby(board.slug, keywords));
  }
  const candidates = (await Promise.all(jobs)).flat();

  // One batched transaction instead of an awaited INSERT per candidate
  // (#285) — a refresh can pull hundreds of listings, and the serial
  // round-trips dominated the cron's runtime.
  const stmt = env.DB.prepare(
    `INSERT INTO feed_items (source, external_id, title, company, location, url, salary_text, role_type, posted_at, board_slug, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (source, external_id) DO NOTHING`,
  );
  const results = candidates.length
    ? await env.DB.batch(
        candidates.map((c) =>
          stmt.bind(
            c.source,
            c.external_id,
            c.title,
            c.company,
            c.location,
            c.url,
            c.salary_text,
            c.role_type,
            c.posted_at,
            c.board_slug ?? null,
            c.description ?? null,
          ),
        ),
      )
    : [];
  const inserted = results.reduce(
    (n, r) => n + (r.meta.changes > 0 ? 1 : 0),
    0,
  );
  return { inserted, seen: candidates.length };
}

export function registerFeedRoutes(app: Hono<AppEnv>) {
  app.get("/api/feed", async (c) => {
    const userId = c.get("userId");
    // Keyset pagination (#261) — the feed grows unbounded as sources are
    // ingested, so read a page at a time. Sort key is COALESCE(posted_at,
    // '') so NULL posted_at rows (they sort last) still page correctly;
    // (sortKey, id) is a unique, stable cursor. The client sends the last
    // row's cursor back to fetch the next page.
    const url = new URL(c.req.url);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 25),
    );
    const cursorK = url.searchParams.get("cursorK");
    const cursorId = url.searchParams.get("cursorId");
    const hasCursor = cursorK !== null && cursorId !== null;

    // A feed_item is "new" for this user unless a feed_item_status row
    // says otherwise (dismissed/added) — that row only exists once the
    // user has acted on it. Blocked companies (#218) are filtered the
    // same way: per-user, at read time, since feed_items is shared.
    // ATS-board items (#219) are the one exception to the shared pool —
    // board_slug scopes them to only the user(s) who configured that
    // board, since (unlike Adzuna/HN) fetching one is a specific,
    // deliberate "watch this company" request.
    const binds: unknown[] = [userId, userId, userId];
    let cursorClause = "";
    if (hasCursor) {
      cursorClause = `AND (COALESCE(feed_items.posted_at, '') < ?
             OR (COALESCE(feed_items.posted_at, '') = ? AND feed_items.id < ?))`;
      binds.push(cursorK, cursorK, Number(cursorId));
    }
    binds.push(limit);

    const { results } = await c.env.DB.prepare(
      `SELECT feed_items.*
       FROM feed_items
       LEFT JOIN feed_item_status
         ON feed_item_status.feed_item_id = feed_items.id
         AND feed_item_status.user_id = ?
       WHERE COALESCE(feed_item_status.status, 'new') = 'new'
         AND NOT EXISTS (
           SELECT 1 FROM feed_company_blocklist
           WHERE feed_company_blocklist.user_id = ?
             AND feed_company_blocklist.company = feed_items.company COLLATE NOCASE
         )
         AND (
           feed_items.board_slug IS NULL
           OR EXISTS (
             SELECT 1 FROM feed_ats_boards
             WHERE feed_ats_boards.user_id = ?
               AND feed_ats_boards.source = feed_items.source
               AND feed_ats_boards.slug = feed_items.board_slug
           )
         )
         ${cursorClause}
       ORDER BY COALESCE(feed_items.posted_at, '') DESC, feed_items.id DESC
       LIMIT ?`,
    )
      .bind(...binds)
      .all<{ id: number; posted_at: string | null }>();

    // A full page means there may be more; anything short is the last page.
    const last = results.length === limit ? results[results.length - 1] : null;
    const nextCursor = last
      ? { k: last.posted_at ?? "", id: last.id }
      : null;
    return c.json({ items: results, nextCursor });
  });

  app.get("/api/feed/ats-boards", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM feed_ats_boards WHERE user_id = ? ORDER BY source, slug",
    )
      .bind(c.get("userId"))
      .all();
    return c.json(results);
  });

  app.post("/api/feed/ats-boards", async (c) => {
    const body = await c.req.json();
    const slug = (body.slug ?? "").trim();
    const source = body.source;
    if (!slug || (source !== "greenhouse" && source !== "ashby")) {
      return c.json({ error: "source and slug are required" }, 400);
    }
    const result = await c.env.DB.prepare(
      `INSERT INTO feed_ats_boards (user_id, source, slug) VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING RETURNING *`,
    )
      .bind(c.get("userId"), source, slug)
      .first();
    return c.json(result, 201);
  });

  app.delete("/api/feed/ats-boards/:id", async (c) => {
    await c.env.DB.prepare(
      "DELETE FROM feed_ats_boards WHERE id = ? AND user_id = ?",
    )
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  app.get("/api/feed/blocklist", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM feed_company_blocklist WHERE user_id = ? ORDER BY company COLLATE NOCASE",
    )
      .bind(c.get("userId"))
      .all();
    return c.json(results);
  });

  app.post("/api/feed/blocklist", async (c) => {
    const body = await c.req.json();
    const company = (body.company ?? "").trim();
    if (!company) return c.json({ error: "company is required" }, 400);
    const result = await c.env.DB.prepare(
      `INSERT INTO feed_company_blocklist (user_id, company) VALUES (?, ?)
       ON CONFLICT DO NOTHING RETURNING *`,
    )
      .bind(c.get("userId"), company)
      .first();
    return c.json(result, 201);
  });

  app.delete("/api/feed/blocklist/:id", async (c) => {
    await c.env.DB.prepare(
      "DELETE FROM feed_company_blocklist WHERE id = ? AND user_id = ?",
    )
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  // Manual trigger for testing/on-demand refresh (cron does this
  // automatically). Admin-only (#346): it fans out to every external
  // source for ALL users, so any invited account could otherwise burn the
  // shared rate-limited quota.
  app.post("/api/feed/refresh", async (c) => {
    if (c.get("userRole") !== "admin") {
      return c.json({ error: "forbidden" }, 403);
    }
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
        description: string | null;
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

    // Carry the feed item's job description onto the new application so
    // tailoring / cover-letter / keyword-match work without re-pasting it.
    const application = await c.env.DB.prepare(
      `INSERT INTO applications (user_id, company_id, title, role_type, url, source, salary_range, status, job_description, job_description_captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'interested', ?, ?) RETURNING *`,
    )
      .bind(
        userId,
        companyId,
        item.title,
        item.role_type,
        item.url,
        `feed:${item.source}`,
        item.salary_text,
        item.description,
        item.description ? new Date().toISOString() : null,
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
