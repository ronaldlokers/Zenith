import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A migration reaches production the moment it merges — deploy.yml applies it
// on push to main — and there are no down files. CI reads none of the SQL, so
// a DROP or a DELETE lands exactly like a CREATE, gated only by whether a
// reviewer happened to look closely at the one file in the diff that cannot
// be undone.
//
// The review asked for a CI step that "flags for reviewer attention". A flag
// nobody has to answer is a flag nobody reads, so this asks the author
// instead: a migration that removes anything has to say what it removes.
// The sentence then sits in the diff, which is where the reviewer already is.
//
// Note that most DROPs here are not data loss at all — SQLite alters a table
// by building a new one, copying rows across, dropping the old and renaming.
// That idiom is indistinguishable from a real drop by pattern alone, which is
// exactly why this wants a sentence from the author rather than a cleverer
// regex.
const ROOT = new URL("..", import.meta.url).pathname;
const DIR = `${ROOT}migrations`;

// Comments are stripped before scanning: 0047 explains the DROP COLUMN
// restriction in prose, and a guard that reads its own documentation as a
// violation is the trap the no-emoji and ellipsis guards each hit first.
const stripComments = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const DESTRUCTIVE = /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bDELETE\s+FROM\b/i;
const ACKNOWLEDGED = /--\s*destructive:/i;

// Migrations are immutable — a file that has shipped never changes again — so
// naming the ones that predate this guard is a list that cannot rot. Adding
// to it means editing applied history, which is the thing to stop, not a
// convenience.
const BEFORE_THIS_GUARD = new Set([
  "0006_contact_interactions.sql",
  "0010_role_types_and_feed_config.sql",
  "0024_multi_user.sql",
  "0025_remove_arbeitnow_source.sql",
  "0034_ats_boards.sql",
  "0040_remove_hn_source.sql",
  "0041_notification_due_contact.sql",
  "0043_notification_weekly_digest.sql",
  "0047_drop_feed_items_status.sql",
  "0052_upcoming_reminder_types.sql",
  "0054_hash_api_key.sql",
  "0058_feed_saved.sql",
]);

describe("a migration that removes something", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));

  it("found the migrations to check", () => {
    // Without this the rule below passes over an empty list — the way a
    // wrong path or a changed extension would leave it guarding nothing.
    expect(files.length, `no .sql files under ${DIR}`).toBeGreaterThan(20);
  });

  it("says what it removes, in the file", () => {
    const unexplained = files
      .filter((f) => !BEFORE_THIS_GUARD.has(f))
      .filter((f) => {
        const sql = readFileSync(`${DIR}/${f}`, "utf8");
        return DESTRUCTIVE.test(stripComments(sql)) && !ACKNOWLEDGED.test(sql);
      });
    expect(
      unexplained,
      "these drop or delete something and never say what — add a `-- destructive:` line naming what goes and why that is safe",
    ).toEqual([]);
  });

  it("reads prose about a DROP as prose", () => {
    // 0047 explains the DROP COLUMN restriction in a comment, and is exempt
    // above, so no migration in the tree currently exercises this — it is
    // here for the next one that documents what it is doing. Asserted
    // directly rather than left to be discovered when a correct migration
    // fails this guard for describing itself.
    const prose = "-- A rebuild is needed: SQLite DROP COLUMN can't remove an indexed column.\nCREATE TABLE t (id INTEGER);";
    expect(DESTRUCTIVE.test(prose), "the fixture does not mention a DROP at all").toBe(true);
    expect(
      DESTRUCTIVE.test(stripComments(prose)),
      "a migration that only mentions a DROP in a comment is read as destructive",
    ).toBe(false);
  });

  it("keeps the grandfathered list to migrations that exist", () => {
    // If one is renamed or removed, the exemption silently starts covering
    // nothing while looking like it still does.
    const missing = [...BEFORE_THIS_GUARD].filter((f) => !files.includes(f));
    expect(missing, "the exemption list names migrations that are gone").toEqual([]);
  });
});
