import type { Hono } from "hono";

// Free job-source ingestion. See issue #16/#34 for the research behind
// this source list — Indeed and LinkedIn have no usable public API.

const ROLE_KEYWORDS: Record<string, string[]> = {
  devops: ["devops", "site reliability", "sre", "infrastructure engineer"],
  "platform-engineer": ["platform engineer", "cloud engineer", "platform team"],
  "front-end": ["front-end", "frontend", "front end", "ui engineer", "react developer"],
  typescript: ["typescript", "node.js developer", "full-stack", "fullstack"],
};

function guessRoleType(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return role;
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

async function fetchAdzuna(env: Env): Promise<FeedCandidate[]> {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return [];
  const roles = Object.keys(ROLE_KEYWORDS);
  const out: FeedCandidate[] = [];
  for (const role of roles) {
    const query = ROLE_KEYWORDS[role][0];
    const url =
      `https://api.adzuna.com/v1/api/jobs/nl/search/1` +
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

async function fetchHnWhoIsHiring(): Promise<FeedCandidate[]> {
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
    for (const hit of commentsData.hits) {
      const text = hit.comment_text ?? "";
      const firstLine = text.split(/<p>|\n/)[0].replace(/<[^>]+>/g, "");
      const role = guessRoleType(text);
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

async function fetchArbeitnow(): Promise<FeedCandidate[]> {
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
    for (const job of data.data) {
      const role = guessRoleType(`${job.title} ${(job.tags ?? []).join(" ")}`);
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
  const candidates = (
    await Promise.all([fetchAdzuna(env), fetchHnWhoIsHiring(), fetchArbeitnow()])
  ).flat();

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

export function registerFeedRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/feed", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM feed_items WHERE status = 'new' ORDER BY posted_at DESC, id DESC`,
    ).all();
    return c.json(results);
  });

  // Manual trigger for testing/on-demand refresh (cron does this automatically)
  app.post("/api/feed/refresh", async (c) => {
    const result = await refreshFeed(c.env);
    return c.json(result);
  });

  app.post("/api/feed/:id/dismiss", async (c) => {
    await c.env.DB.prepare(
      "UPDATE feed_items SET status = 'dismissed' WHERE id = ?",
    )
      .bind(c.req.param("id"))
      .run();
    return c.body(null, 204);
  });

  app.post("/api/feed/:id/add", async (c) => {
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
        "SELECT id FROM companies WHERE lower(name) = lower(?)",
      )
        .bind(item.company)
        .first<{ id: number }>();
      if (existing) {
        companyId = existing.id;
      } else {
        const created = await c.env.DB.prepare(
          "INSERT INTO companies (name) VALUES (?) RETURNING id",
        )
          .bind(item.company)
          .first<{ id: number }>();
        companyId = created?.id ?? null;
      }
    }

    const application = await c.env.DB.prepare(
      `INSERT INTO applications (company_id, title, role_type, url, source, salary_range, status)
       VALUES (?, ?, ?, ?, ?, ?, 'interested') RETURNING *`,
    )
      .bind(
        companyId,
        item.title,
        item.role_type,
        item.url,
        `feed:${item.source}`,
        item.salary_text,
      )
      .first();

    await c.env.DB.prepare("UPDATE feed_items SET status = 'added' WHERE id = ?")
      .bind(c.req.param("id"))
      .run();

    return c.json(application, 201);
  });
}
