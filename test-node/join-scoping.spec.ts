import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Defence in depth behind the write-time findForeignRef check, and the reason
// /api/applications spells it out in its own comment: every join is scoped by
// user_id too, so a cross-tenant company_id or contact_id can never surface
// another user's name.
//
// It was applied to the list routes and not to the others. /api/agenda and
// /api/activity joined companies and contacts by id alone, and so did all
// three legs of the ICS calendar feed — the one surface that answers without
// a session at all.
//
// A WHERE on the outer table does not scope a join. It filters which outer
// rows are considered; the joined row is still whatever matched the id. So
// this reads the ON clause and nothing else, which is the whole point: the
// first version of this check looked at the following three lines, counted
// the WHERE as scoping, and reported every one of these as fine.
const ROOT = new URL("..", import.meta.url).pathname;

// Tables with a user_id column. A join onto one of these can cross tenants;
// a join onto feed_items (a deliberately shared pool) cannot.
const USER_OWNED = new Set([
  "applications", "companies", "contacts", "interactions", "status_history",
  "documents", "tags", "application_tags", "interview_prep_items",
  "journal_entries", "saved_views", "webhooks", "feed_ats_boards",
  "feed_company_blocklist", "notifications", "cv_versions", "work_experience",
  "education", "languages", "skills", "profile", "user_goals",
  "outreach_templates", "feed_role_keywords", "feed_sources", "role_types",
  "feed_item_status",
]);

// Where the ON clause ends.
const CLAUSE_END = /^\s*(WHERE|JOIN|LEFT JOIN|INNER JOIN|GROUP BY|ORDER BY|LIMIT|UNION|\)|`)/i;

function workerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...workerFiles(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("cross-tenant joins", () => {
  it("scopes every join onto a user-owned table by user_id", () => {
    const offenders: string[] = [];
    for (const file of workerFiles(join(ROOT, "worker"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const table = line.match(/\bJOIN\s+([a-z_]+)/)?.[1];
        if (!table || !USER_OWNED.has(table)) return;
        const on = [line];
        for (const next of lines.slice(i + 1, i + 5)) {
          if (CLAUSE_END.test(next)) break;
          on.push(next);
        }
        if (!on.join(" ").includes("user_id")) {
          offenders.push(`${file.slice(ROOT.length)}:${i + 1} ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      "these joins match on id alone, so a cross-tenant id would surface another user's row",
    ).toEqual([]);
  });
});
