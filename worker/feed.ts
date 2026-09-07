import type { Hono } from "hono";
import type { AppEnv } from "./index.js";
import { recordCronRun } from "./cron-log.js";
import { PLATFORM_CONNECTION_LIMIT, runBounded } from "./concurrency.js";

// Each board is fetched in turn; one that never answers would otherwise stall
// the whole pull, and this runs unattended on a cron.
const FEED_TIMEOUT_MS = 15_000;

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

// Feed "fit" count, computed server-side (perf review, #446): how many of the
// user's CV-backed skills a job description mentions (word-boundary match).
// Done here so the feed list can return a small integer instead of shipping
// every item's full ≤8000-char description just for the client to count.
// Mirrors src/skill-match.ts's word-boundary rule.
function matchedSkills(jd: string, skillNames: string[]): string[] {
  const lower = jd.toLowerCase();
  return skillNames.filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
  });
}

// Not configured and broken are different answers, and the feed used to give
// the same one for both. This marks the first so refreshFeed can record it as
// a fact about the setup rather than a fault.
export class SourceUnconfigured extends Error {}

// One label shape, defined once, because the feed route parses these back out
// to tell a user which of *their* sources is broken. A drift between writer
// and reader would silently report every source as healthy.
export const FEED_SOURCE_LABEL = {
  adzuna: () => "feed:adzuna",
  board: (source: string, slug: string) => `feed:${source}:${slug}`,
};

export async function fetchAdzuna(
  env: Env,
  keywords: RoleKeywords,
  country: string | null,
): Promise<FeedCandidate[]> {
  // Not configured is not broken, and the difference is the whole point of
  // this card: a user who never set up Adzuna should not be told it failed.
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
    throw new SourceUnconfigured("Adzuna credentials are not set on this server");
  }
  const countryCode = (country || "nl").toLowerCase();
  // Fetch every role's keyword query concurrently (#449) — the old sequential
  // loop made latency scale linearly with the number of configured roles.
  // Bounded the same way the source-level fan-out in refreshFeed is (#660):
  // this is one more unbounded Promise.all over outbound fetches, and role
  // count grows with what users configure too.
  const perRole = await runBounded(
    Object.entries(keywords).map(([role, kws]) => async (): Promise<
      FeedCandidate[]
    > => {
      if (kws.length === 0) return [];
      const query = kws[0];
      const url =
        `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/1` +
        `?app_id=${env.ADZUNA_APP_ID}&app_key=${env.ADZUNA_APP_KEY}` +
        `&results_per_page=10&what=${encodeURIComponent(query)}&content-type=application/json`;
      {
        const res = await fetch(url, { signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`Adzuna answered ${res.status}`);
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
        return (data.results ?? []).map((job) => ({
          source: "adzuna" as const,
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
        }));
      }
    }),
    PLATFORM_CONNECTION_LIMIT,
  );
  return perRole.flat();
}

// Direct ATS sourcing (#219) — Greenhouse and Ashby both publish free,
// keyless public APIs for one company's own job board. No keyword
// filtering: a user who explicitly asked to watch a company's board
// wants everything on it, not a role-guessed subset (role_type still
// gets tagged, best-effort, for consistency with the rest of the feed
// UI, but a miss doesn't drop the listing the way it does for HN).
export async function fetchGreenhouse(
  slug: string,
  keywords: RoleKeywords,
): Promise<FeedCandidate[]> {
  {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
      { signal: AbortSignal.timeout(FEED_TIMEOUT_MS) },
    );
    // A 404 here is the commonest real failure: a mistyped board slug saves
    // happily and then returns nothing forever. Empty is a fact about the
    // board; not-ok is a fact about the request, and they must not read the
    // same on the way out.
    if (!res.ok) throw new Error(`Greenhouse board "${slug}" answered ${res.status}`);
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
  }
}

export async function fetchAshby(
  slug: string,
  keywords: RoleKeywords,
): Promise<FeedCandidate[]> {
  {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(FEED_TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`Ashby board "${slug}" answered ${res.status}`);
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
  }
}

// What a user is allowed to see in the shared pool, as one fragment rather
// than two copies. Today's unread count and the feed list itself have to agree
// — a count that includes a blocked company, or a board the user stopped
// watching, sends someone to a feed that does not have what the badge
// promised. Takes two binds: blocklist user, ATS-board user.
const VISIBLE_TO_USER = `
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
         )`;

export async function refreshFeed(env: Env): Promise<{ inserted: number; seen: number }> {
  const [keywords, configs, atsBoards] = await Promise.all([
    loadRoleKeywords(env),
    loadDistinctSourceConfigs(env),
    loadDistinctAtsBoards(env),
  ]);

  // One source failing must not take the others down, and it must not read as
  // "nothing new" either. Each is recorded under its own label so the feed can
  // say which one is broken; SourceUnconfigured is recorded as a success,
  // because a source nobody set up has not failed at anything.
  const attempt = async (
    label: string,
    work: Promise<FeedCandidate[]>,
  ): Promise<FeedCandidate[]> => {
    try {
      const items = await work;
      await recordCronRun(env, label, null);
      return items;
    } catch (e) {
      await recordCronRun(env, label, e instanceof SourceUnconfigured ? null : e);
      return [];
    }
  };

  // Thunks, not promises: a promise here would already have called fetch()
  // by the time runBounded saw it, defeating the whole cap. This is also
  // where the aggregation pays off — one job per *distinct* config/board
  // (already deduped across every user by loadDistinctSourceConfigs /
  // loadDistinctAtsBoards above), so two people watching the same company
  // still costs one fetch, and bounding this list bounds the real fan-out
  // rather than papering over it.
  const jobs: Array<() => Promise<FeedCandidate[]>> = [];
  for (const cfg of configs.filter((c) => c.source === "adzuna")) {
    jobs.push(() => attempt(FEED_SOURCE_LABEL.adzuna(), fetchAdzuna(env, keywords, cfg.location)));
  }
  for (const board of atsBoards.filter((b) => b.source === "greenhouse")) {
    jobs.push(() =>
      attempt(
        FEED_SOURCE_LABEL.board("greenhouse", board.slug),
        fetchGreenhouse(board.slug, keywords),
      ),
    );
  }
  for (const board of atsBoards.filter((b) => b.source === "ashby")) {
    jobs.push(() =>
      attempt(
        FEED_SOURCE_LABEL.board("ashby", board.slug),
        fetchAshby(board.slug, keywords),
      ),
    );
  }
  // Bounded rather than one Promise.all over the lot (SRE review, #660): the
  // job count above scales with every user's watched boards, and `attempt`
  // already keeps one source's failure from losing another's results — this
  // only needed to stop them all firing at once.
  const candidates = (await runBounded(jobs, PLATFORM_CONNECTION_LIMIT)).flat();

  // One batched transaction instead of an awaited INSERT per candidate
  // (#285) — a refresh can pull hundreds of listings, and the serial
  // round-trips dominated the cron's runtime.
  //
  // ON CONFLICT (source, external_id) does two jobs, not one: it collapses
  // the same listing seen again on an ordinary 6-hourly re-poll, and it also
  // carries the Cloudflare cron retry, which can run refreshFeed a second time
  // concurrently with the first (see worker/index.ts's scheduled()).
  //
  // The duplicate row is prevented by the UNIQUE (source, external_id) index
  // in migrations/0007, not by this clause — remove the index and there is
  // nothing here to conflict on. This clause is what makes the collision a
  // silent skip rather than a thrown error, so a retried pass finishes the
  // remaining candidates instead of aborting on the first one already stored.
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

// Exported so its query plan can be asserted (test-node has no D1; the check
// lives in test/feed-index.spec.ts). Before migration 0062 this ORDER BY had
// no index behind it at all — the only one feed_items ever carried was
// idx_feed_items_status, dropped in 0047 — so every page read the whole table
// and built a temp b-tree to sort it, on a tier that bills rows read.
export function feedPageSql(cursorClause: string): string {
  return `SELECT feed_items.*,
              COALESCE(feed_item_status.status, 'new') AS status
       FROM feed_items
       LEFT JOIN feed_item_status
         ON feed_item_status.feed_item_id = feed_items.id
         AND feed_item_status.user_id = ?
       WHERE COALESCE(feed_item_status.status, 'new') IN ('new', 'saved')
         ${VISIBLE_TO_USER}
         ${cursorClause}
       ORDER BY COALESCE(feed_items.posted_at, '') DESC, feed_items.id DESC
       LIMIT ?`;
}

// feed_items was insert-only. refreshFeed batch-inserts every candidate every
// six hours with ON CONFLICT DO NOTHING, and nothing anywhere deleted from it.
// That is not only wasted space: the nightly backup has to serialise the whole
// database into one JS object inside a 128 MB Worker, so a table that grows
// without bound eventually stops the backup working.
//
// Sixty days on fetched_at — when Zenith saw the posting, not when the source
// claims it was published, since posted_at is optional and whatever the board
// felt like reporting. A two-month-old listing is not a lead any more.
export const FEED_ITEM_RETENTION_DAYS = 60;

// A feed_item_status row is the user's opinion about a posting — saved, or
// dismissed — and since #689 those rows travel in their export. Pruning the
// posting out from under one would leave the export holding a verdict about a
// job that no longer exists, so anything acted on stays regardless of age.
export async function pruneFeedItems(env: Env): Promise<{ removed: number }> {
  const res = await env.DB.prepare(
    `DELETE FROM feed_items
      WHERE fetched_at < datetime('now', ?)
        AND NOT EXISTS (
          SELECT 1 FROM feed_item_status
           WHERE feed_item_status.feed_item_id = feed_items.id
        )`,
  )
    .bind(`-${FEED_ITEM_RETENTION_DAYS} days`)
    .run();
  return { removed: res.meta.changes ?? 0 };
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

    const { results } = await c.env.DB.prepare(feedPageSql(cursorClause))
      .bind(...binds)
      .all<{ id: number; posted_at: string | null; description: string | null }>();

    // A full page means there may be more; anything short is the last page.
    const last = results.length === limit ? results[results.length - 1] : null;
    const nextCursor = last
      ? { k: last.posted_at ?? "", id: last.id }
      : null;

    // Compute the skill-fit count here and drop the full description from the
    // payload (perf review, #446): the client only ever used it to count.
    const { results: skillRows } = await c.env.DB.prepare(
      `SELECT DISTINCT skills.name
       FROM work_experience_skills wes
       JOIN skills ON skills.id = wes.skill_id
                  AND skills.user_id = wes.user_id
       WHERE wes.user_id = ?`,
    )
      .bind(userId)
      .all<{ name: string }>();
    const skillNames = skillRows.map((r) => r.name);
    const items = results.map((row) => {
      const { description, ...rest } = row;
      // Return the matched skill NAMES (not just the count) so the feed can
      // explain *why* an item fits — the "reasons" behind the score (#471).
      const match_skills = description
        ? matchedSkills(description, skillNames)
        : [];
      // A first-paragraph preview, not the whole description. The pane the
      // user triages from carried no posting text at all — source, date,
      // title, company, location, role, salary, matched skills and two
      // buttons, and not one word of the job — so add and dismiss were being
      // decided from the title. The full text stays off the wire (it is up to
      // 8000 chars per row, which is why it was dropped); 400 is about the
      // first paragraph, which is what candidates skim to decide.
      const description_snippet = (() => {
        if (!description) return null;
        const flat = description.replace(/\s+/g, " ").trim();
        // The ellipsis belongs where the cut is made. Appending it in the
        // view put "…" after descriptions that were never truncated, which
        // says there is more to read when there is not.
        return flat.length > 400 ? `${flat.slice(0, 400)}…` : flat;
      })();
      return {
        ...rest,
        description_snippet,
        match_skills,
        match_count: match_skills.length,
      };
    });
    // Which of *this user's* sources failed on their last attempt. Without
    // this the feed has one empty state for three different situations —
    // nothing new, a mistyped board slug that will return nothing forever,
    // and an upstream outage — and they render identically, so the user
    // concludes the feature works and never reports the real defect.
    //
    // Scoped to the sources this user actually watches: the health is
    // instance-level (the credentials and the upstream API are shared), but
    // being told that somebody else's board is down is noise.
    const watched = new Set<string>([
      FEED_SOURCE_LABEL.adzuna(),
      ...(
        await c.env.DB.prepare(
          "SELECT source, slug FROM feed_ats_boards WHERE user_id = ?",
        )
          .bind(userId)
          .all<{ source: string; slug: string }>()
      ).results.map((b) => FEED_SOURCE_LABEL.board(b.source, b.slug)),
    ]);
    const { results: health } = await c.env.DB.prepare(
      `SELECT label, error FROM cron_runs
        WHERE id IN (SELECT MAX(id) FROM cron_runs WHERE label LIKE 'feed:%' GROUP BY label)
          AND ok = 0`,
    ).all<{ label: string; error: string | null }>();
    const failingSources = health
      .filter((h) => watched.has(h.label))
      .map((h) => ({ source: h.label.replace(/^feed:/, ""), error: h.error }));

    return c.json({ items, nextCursor, failingSources });
  });

  // Just the number, for Today. The daily loop is open, see what is due,
  // triage new matches — and the third step had no entry point anywhere in
  // the chrome, so it ran on memory while the first two ran on a glance.
  //
  // A count, not a page of items: Today should not pull twenty-five feed rows
  // and their skill matching to render one line. Counts 'new' only — 'saved'
  // has already been triaged once, and offering it again as something to
  // triage is what makes a badge stop meaning anything.
  app.get("/api/feed/summary", async (c) => {
    const userId = c.get("userId");
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM feed_items
       LEFT JOIN feed_item_status
         ON feed_item_status.feed_item_id = feed_items.id
         AND feed_item_status.user_id = ?
       WHERE COALESCE(feed_item_status.status, 'new') = 'new'
         ${VISIBLE_TO_USER}`,
    )
      .bind(userId, userId, userId)
      .first<{ count: number }>();
    return c.json({ count: row?.count ?? 0 });
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

  // Undo for the dismiss above. Dismissing is the majority action in triage
  // and it was silent and permanent; the toast that now confirms it needs
  // somewhere to send the user back to. Deletes the row rather than writing
  // status = 'new', because "new" is what the absence of a row already means
  // (the feed list reads COALESCE(status, 'new')) — two ways to say the same
  // thing is how the two drift.
  // Save / unsave. Deliberately not a pipeline state: a saved posting stays
  // in the feed and never becomes an application, so the counts every other
  // surface reads — the board, the funnel, the response rate — keep meaning
  // "things I actually applied to". Triage had only two doors before, so a
  // maybe had to go through the one marked "applied".
  app.post("/api/feed/:id/save", async (c) => {
    await c.env.DB.prepare(
      `INSERT INTO feed_item_status (feed_item_id, user_id, status)
       VALUES (?, ?, 'saved')
       ON CONFLICT (feed_item_id, user_id) DO UPDATE SET status = 'saved'`,
    )
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  app.post("/api/feed/:id/unsave", async (c) => {
    // Deletes rather than writing 'new', for the same reason undismiss does:
    // the absence of a row is already what "new" means to the list query.
    await c.env.DB.prepare(
      `DELETE FROM feed_item_status
       WHERE feed_item_id = ? AND user_id = ? AND status = 'saved'`,
    )
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  app.post("/api/feed/:id/undismiss", async (c) => {
    await c.env.DB.prepare(
      `DELETE FROM feed_item_status
       WHERE feed_item_id = ? AND user_id = ? AND status = 'dismissed'`,
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
