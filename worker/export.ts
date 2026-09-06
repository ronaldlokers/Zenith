import type { Hono } from "hono";
import { attachDocumentBytes } from "./export-documents.js";
import type { AppEnv } from "./index.js";

// The data export and its CSV sibling, lifted out of worker/index.ts (#100).
// The table list, the per-table query, the two dump builders and the CSV
// escaper are one subsystem, and the only thing they had in common with the
// router around them was having been written at the same time.
//
// buildFullExport stays exported: the nightly backup calls it, and
// test/export-coverage.spec.ts asserts every user-data table is in the list.

// --- Export ---

const EXPORT_TABLES = [
  "companies",
  "contacts",
  "applications",
  "interactions",
  "status_history",
  "documents",
  "application_tags",
  "tags",
  "profile",
  "skills",
  "work_experience",
  "work_experience_skills",
  "education",
  "languages",
  "cv_versions",
  "interview_prep_items",
  "outreach_templates",
  "user_goals",
  "role_types",
  "feed_sources",
  "feed_role_keywords",
  "feed_items",
  "feed_item_status",
  // Added after a coverage test found them missing: all six hold user data
  // and none of them were in the backup. journal_entries is prose the user
  // wrote; the rest is configuration they would have to rebuild by hand.
  "journal_entries",
  "saved_views",
  "webhooks",
  "feed_ats_boards",
  "feed_company_blocklist",
  "notifications",
] as const;

// feed_items is a shared pool with no user_id (migration 0024), which the
// export used to treat as a reason to hand over the whole table: SELECT *, no
// predicate, no LIMIT, served synchronously into a browser download. The rows
// are public job postings so it was never a tenant leak, but one person's
// export scaled with everyone's ingest and with all of history, on a table
// that only grows and carries the full posting description (0045).
//
// What is the user's own data here is their relationship to a posting — the
// feed_item_status row saying they saved or dismissed it — so the export
// follows that rather than dropping feed_items outright. A list of dismissed
// postings with no postings in it would not be portable.
//
// buildFullExport is deliberately not changed: the backup restores the
// instance rather than an account, and scoping it would lose every posting
// nobody has triaged yet.
const USER_SCOPED_BY_STATUS = new Set(["feed_items"]);

function exportQuery(env: Env, table: string, userId: string) {
  if (USER_SCOPED_BY_STATUS.has(table)) {
    return env.DB.prepare(
      `SELECT ${table}.* FROM ${table}
        WHERE EXISTS (
          SELECT 1 FROM feed_item_status
           WHERE feed_item_status.feed_item_id = ${table}.id
             AND feed_item_status.user_id = ?
        )`,
    ).bind(userId);
  }
  return env.DB.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).bind(userId);
}

export async function buildFullExport(
  env: Env,
): Promise<Record<string, unknown>> {
  const dump: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
    dump[table] = results;
  }
  return { exported_at: new Date().toISOString(), ...dump };
}

async function buildUserExport(
  env: Env,
  userId: string,
): Promise<Record<string, unknown>> {
  const dump: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const { results } = await exportQuery(env, table, userId).all();
    dump[table] = results;
  }
  const omitted = await attachDocumentBytes(
    env,
    (dump.documents ?? []) as Record<string, unknown>[],
  );
  return {
    exported_at: new Date().toISOString(),
    ...dump,
    omitted_documents: omitted,
  };
}

export function registerExportRoutes(app: Hono<AppEnv>) {
  app.get("/api/export", async (c) => {
  const dump = await buildUserExport(c.env, c.get("userId"));
  return c.json(dump, 200, {
    "Content-Disposition": `attachment; filename="zenith-export-${new Date().toISOString().slice(0, 10)}.json"`,
  });
});

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Formula-injection guard (#346): titles/notes/company names can come
    // from scraped postings or external feed boards, and a leading = + - @
    // (or tab/CR) opens as a live formula in Excel/Sheets. The leading
    // apostrophe is the spreadsheet-standard "treat as text" escape.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((col) => escape(r[col])).join(",")),
  ].join("\n");
}

  app.get("/api/export/:table", async (c) => {
  const table = c.req.param("table").replace(/\.csv$/, "");
  if (!(EXPORT_TABLES as readonly string[]).includes(table)) {
    return c.json({ error: "unknown table" }, 404);
  }
  const { results } = await exportQuery(c.env, table, c.get("userId")).all();
  return c.body(toCsv(results as Record<string, unknown>[]), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="zenith-${table}.csv"`,
  });
});
}
