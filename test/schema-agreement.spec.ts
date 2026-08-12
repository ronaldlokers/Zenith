import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { STATUSES, TERMINAL_STATUSES } from "../src/types";
import { PIPELINE, BOARD_RAILS } from "../src/format";

// The set of stages is written down in four places: a TypeScript union, a
// CHECK constraint in the applications table, the board's rail order, and the
// locale files. Nothing keeps them in step. Adding a stage to the union and
// forgetting the constraint compiles, ships, and fails at the first write
// with a bare SQLITE_CONSTRAINT; forgetting the locale ships a board column
// labelled "stages.negotiating".
//
// This is the same drift that left six tables out of the backup and three
// out of account deletion — a list maintained by memory across a boundary
// the compiler cannot see.

async function checkedStatuses(): Promise<string[]> {
  const row = await env.DB.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'applications'",
  ).first<{ sql: string }>();
  expect(row?.sql, "applications table not found").toBeTruthy();
  const m = row!.sql.match(/status TEXT[^,]*?CHECK \(status IN \(([^)]+)\)\)/s);
  expect(m, "no CHECK constraint on applications.status").toBeTruthy();
  return m![1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

describe("stage list agreement", () => {
  it("matches the database's CHECK constraint, in order", async () => {
    // Order matters as well as membership: the constraint reads as the
    // pipeline, and someone appending a stage in the middle of one list and
    // the end of another is exactly the drift being guarded.
    expect(await checkedStatuses()).toEqual([...STATUSES]);
  });

  it("covers every stage between the pipeline and the terminal set", () => {
    // The board draws PIPELINE then the terminal stages; a stage in neither
    // exists in the type but appears on no screen.
    const drawn = new Set([...PIPELINE, ...TERMINAL_STATUSES]);
    expect(STATUSES.filter((s) => !drawn.has(s))).toEqual([]);
  });

  it("has a rail for every stage, plus the archive", () => {
    expect(BOARD_RAILS).toEqual([...STATUSES, "archived"]);
  });

  it("has a label for every stage in both locales", async () => {
    // A missing label renders the key: a column headed "stages.ghosted".
    const [en, nl] = await Promise.all([
      import("../src/locales/en.json"),
      import("../src/locales/nl.json"),
    ]);
    for (const [name, bundle] of [
      ["en", en.default],
      ["nl", nl.default],
    ] as const) {
      const stages = (bundle as { stages: Record<string, string> }).stages;
      const missing = STATUSES.filter((s) => !stages[s]);
      expect(missing, `${name} is missing stage labels`).toEqual([]);
    }
  });
});
