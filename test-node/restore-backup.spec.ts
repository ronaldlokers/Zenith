import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs script, no types, deliberately not compiled
import { RESTORE_ORDER, sqlForBackup, sqlValue, summarize } from "../scripts/restore-backup.mjs";

// The nightly backup had no restore path at all until scripts/restore-backup.mjs
// existed. The script is only ever run on the worst day the product has, so the
// thing worth pinning is not that it emits SQL — it is that it cannot silently
// skip data.

function exportTables(): string[] {
  const source = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const block = source.match(/const EXPORT_TABLES = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error("EXPORT_TABLES not found in worker/index.ts");
  return [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

describe("restore-backup", () => {
  it("restores every table the backup writes", () => {
    // The failure this prevents: someone adds a table to EXPORT_TABLES, the
    // nightly dump starts carrying it, and a restore silently drops it on the
    // floor. Nobody finds out until the restore is the only copy left.
    const missing = exportTables().filter((t) => !RESTORE_ORDER.includes(t));
    expect(missing, "tables in EXPORT_TABLES but not in RESTORE_ORDER").toEqual([]);
  });

  it("does not invent tables the backup never carries", () => {
    const tables = exportTables();
    const extra = RESTORE_ORDER.filter((t: string) => !tables.includes(t));
    expect(extra, "tables in RESTORE_ORDER but not in EXPORT_TABLES").toEqual([]);
  });

  it("inserts parents before the rows that reference them", () => {
    const at = (t: string) => RESTORE_ORDER.indexOf(t);
    // Each pair is a real foreign key in migrations/, and each one is a row
    // that cannot be written before the row it points at.
    const pairs: [string, string][] = [
      ["companies", "applications"],
      ["companies", "contacts"],
      ["applications", "interactions"],
      ["applications", "status_history"],
      ["applications", "documents"],
      ["applications", "application_tags"],
      ["tags", "application_tags"],
      ["applications", "interview_prep_items"],
      ["work_experience", "work_experience_skills"],
      ["skills", "work_experience_skills"],
      ["feed_items", "feed_item_status"],
    ];
    for (const [parent, child] of pairs) {
      expect(at(parent), `${parent} must be restored before ${child}`).toBeLessThan(at(child));
    }
  });

  it("escapes values rather than concatenating them", () => {
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(undefined)).toBe("NULL");
    expect(sqlValue(42)).toBe("42");
    expect(sqlValue(-1.5)).toBe("-1.5");
    expect(sqlValue(true)).toBe("1");
    expect(sqlValue(false)).toBe("0");
    expect(sqlValue("plain")).toBe("'plain'");
    // A recruiter note containing an apostrophe is ordinary content here, and
    // is exactly what would end a statement early if it were not doubled.
    expect(sqlValue("O'Brien")).toBe("'O''Brien'");
    expect(sqlValue("'; DROP TABLE applications; --")).toBe("'''; DROP TABLE applications; --'");
    expect(sqlValue("emoji ✅ and — dashes")).toBe("'emoji ✅ and — dashes'");
  });

  it("refuses values it cannot represent instead of coercing them", () => {
    expect(() => sqlValue(Number.NaN)).toThrow(/non-finite/);
    expect(() => sqlValue(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => sqlValue({ nested: true })).toThrow(/unsupported value type/);
  });

  it("emits idempotent inserts with quoted identifiers", () => {
    const sql = sqlForBackup({
      companies: [{ id: 1, name: "Lumen Robotics", user_id: "u1" }],
    });
    expect(sql).toBe(
      `INSERT OR REPLACE INTO "companies" ("id", "name", "user_id") VALUES (1, 'Lumen Robotics', 'u1');`,
    );
  });

  it("emits nothing for tables the backup left empty", () => {
    expect(sqlForBackup({ companies: [], applications: [] })).toBe("");
    expect(sqlForBackup({ exported_at: "2026-09-06T03:11:00.000Z" })).toBe("");
  });

  it("orders statements so a child never precedes its parent", () => {
    const sql = sqlForBackup({
      application_tags: [{ application_id: 1, tag_id: 2 }],
      tags: [{ id: 2, name: "remote" }],
      applications: [{ id: 1, title: "Platform Engineer" }],
      companies: [{ id: 3, name: "Meridian Cloud" }],
    });
    const lines = sql.split("\n");
    const at = (table: string) => lines.findIndex((l) => l.includes(`INTO "${table}"`));
    expect(at("companies")).toBeLessThan(at("applications"));
    expect(at("applications")).toBeLessThan(at("application_tags"));
    expect(at("tags")).toBeLessThan(at("application_tags"));
  });

  it("reports a table it does not know how to restore", () => {
    // A backup taken by a newer deploy can carry a table this script predates.
    // Skipping it is survivable; skipping it quietly is not.
    const { unknown, total } = summarize({
      exported_at: "2026-09-06T03:11:00.000Z",
      companies: [{ id: 1 }],
      brand_new_table: [{ id: 1 }, { id: 2 }],
    });
    expect(unknown).toEqual(["brand_new_table"]);
    expect(total).toBe(1);
  });
});
