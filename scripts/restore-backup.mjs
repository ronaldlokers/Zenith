#!/usr/bin/env node
// Load a nightly R2 backup back into D1 (#116 wrote the backups; nothing read
// them). runScheduledBackup dumps every EXPORT_TABLES row to
// backups/YYYY-MM-DD.json daily and keeps 14 — but until this existed there
// was no supported way to turn one of those dumps back into rows, which makes
// the backup a cost rather than a recovery path.
//
//   # what would happen, against the local dev database
//   node scripts/restore-backup.mjs --file backups/2026-09-06.json
//
//   # pull yesterday's backup out of R2 and inspect it
//   node scripts/restore-backup.mjs --key backups/2026-09-06.json --remote
//
//   # actually apply it
//   node scripts/restore-backup.mjs --key backups/2026-09-06.json --remote --execute
//
// Dry run is the default and --remote --execute is the only combination that
// touches production, because the one time this script gets used is the one
// time nobody can afford it to be surprising.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "zenith-documents";
const DATABASE = "zenith";

// Parents before children. buildFullExport's own EXPORT_TABLES order is the
// order the columns were added over time, not a dependency order — it lists
// application_tags before tags, for one. SQLite leaves foreign_keys OFF by
// default so a wrong order would usually still load, but "usually" is not the
// bar for the only copy of someone's data.
//
// test-node/restore-backup.spec.ts fails if this drifts from EXPORT_TABLES, so
// a table added to the backup cannot be silently dropped from the restore.
export const RESTORE_ORDER = [
  // No dependencies of their own.
  "profile",
  "skills",
  "tags",
  "role_types",
  "companies",
  "feed_sources",
  "feed_items",
  "outreach_templates",
  "user_goals",
  "saved_views",
  "webhooks",
  "feed_ats_boards",
  "feed_company_blocklist",
  "feed_role_keywords",
  "journal_entries",
  "notifications",
  // Reference the above.
  "contacts",
  "work_experience",
  "education",
  "languages",
  "cv_versions",
  "applications",
  // Reference applications / contacts / work_experience.
  "interactions",
  "status_history",
  "documents",
  "application_tags",
  "interview_prep_items",
  "work_experience_skills",
  "feed_item_status",
];

// D1 hands back JSON scalars, so this covers everything a dump can contain.
// Anything else is a bug in the caller rather than something to coerce
// quietly — a silently mangled value in a restore is worse than a stop.
export function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number in backup: ${value}`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`unsupported value type in backup: ${typeof value}`);
}

const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

// INSERT OR REPLACE, so re-running after a partial apply converges instead of
// failing on every row that already landed.
export function sqlForBackup(dump) {
  const statements = [];
  for (const table of RESTORE_ORDER) {
    const rows = dump[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const columns = Object.keys(rows[0]);
    if (columns.length === 0) continue;
    const columnList = columns.map(quoteIdent).join(", ");
    for (const row of rows) {
      const values = columns.map((c) => sqlValue(row[c])).join(", ");
      statements.push(`INSERT OR REPLACE INTO ${quoteIdent(table)} (${columnList}) VALUES (${values});`);
    }
  }
  return statements.join("\n");
}

export function summarize(dump) {
  const counts = [];
  for (const table of RESTORE_ORDER) {
    const rows = dump[table];
    if (Array.isArray(rows) && rows.length > 0) counts.push([table, rows.length]);
  }
  // A table in the dump that this script does not know about would otherwise
  // be skipped in silence, which is the failure mode the spec guards — but a
  // backup taken by a newer deploy can still reach an older script.
  const unknown = Object.keys(dump).filter(
    (k) => k !== "exported_at" && Array.isArray(dump[k]) && !RESTORE_ORDER.includes(k),
  );
  return { counts, unknown, total: counts.reduce((n, [, c]) => n + c, 0) };
}

function parseArgs(argv) {
  const args = { remote: false, execute: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--remote") args.remote = true;
    else if (a === "--local") args.remote = false;
    else if (a === "--execute") args.execute = true;
    else if (a === "--key") args.key = argv[++i];
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.key && !args.file) throw new Error("one of --key <r2-key> or --file <path> is required");
  if (args.key && args.file) throw new Error("--key and --file are mutually exclusive");
  return args;
}

function wrangler(argv) {
  return execFileSync("npx", ["wrangler", ...argv], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scope = args.remote ? "--remote" : "--local";

  let raw;
  if (args.file) {
    raw = readFileSync(args.file, "utf8");
  } else {
    const tmp = join(mkdtempSync(join(tmpdir(), "zenith-restore-")), "backup.json");
    wrangler(["r2", "object", "get", `${BUCKET}/${args.key}`, `--file=${tmp}`, scope]);
    raw = readFileSync(tmp, "utf8");
  }

  const dump = JSON.parse(raw);
  const { counts, unknown, total } = summarize(dump);

  console.log(`backup taken at: ${dump.exported_at ?? "(unknown)"}`);
  for (const [table, count] of counts) console.log(`  ${String(count).padStart(7)}  ${table}`);
  console.log(`  ${String(total).padStart(7)}  rows total`);
  if (unknown.length > 0) {
    console.log(`\nWARNING: ${unknown.length} table(s) in the backup are unknown to this script`);
    console.log(`  ${unknown.join(", ")}`);
    console.log("  They will NOT be restored. Update RESTORE_ORDER before relying on this.");
  }

  const sql = sqlForBackup(dump);
  const out = args.out ?? join(mkdtempSync(join(tmpdir(), "zenith-restore-")), "restore.sql");
  writeFileSync(out, sql + "\n");
  console.log(`\nSQL written to ${out}`);

  if (!args.execute) {
    console.log(`\nDry run. Nothing was written to the ${args.remote ? "REMOTE" : "local"} database.`);
    console.log(`Re-run with --execute to apply it.`);
    return;
  }

  console.log(`\nApplying ${total} rows to the ${args.remote ? "REMOTE" : "local"} database…`);
  wrangler(["d1", "execute", DATABASE, `--file=${out}`, scope, "--yes"]);
  console.log("Done.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`restore-backup: ${error.message}`);
    process.exit(1);
  }
}
