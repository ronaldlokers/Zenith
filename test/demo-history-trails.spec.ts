import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// The demo account is what a new user sees first, and its three hand-written
// examples are meant to look like the bulk ones a few lines below. Two did.
// The ghosted one inserted a single (NULL, 'ghosted') row, skipping the stages
// it must have passed through, while historyFor() gives every bulk application
// a full trail — including the terminal ones, where it spells out
// interested → applied → ghosted explicitly.
//
// src/stats.ts now counts a terminal-only application in the funnel base
// rather than dropping it, so this no longer costs the demo its headline
// figure. It still costs it a row at 'applied', and it is the one application
// in the seed whose history does not describe a search anyone could have run.
const BASE = "http://zenith.test";

// Loaded once for the file: a second POST answers 409, since the seed is
// deliberately not re-runnable on an account that already has it.
let seeded: Promise<void> | null = null;
const seedDemo = () =>
  (seeded ??= authedFetch(`${BASE}/api/account/sample-data`, { method: "POST" }).then(
    (res) => {
      expect(res.status, "the sample data did not load").toBeLessThan(300);
    },
  ));

describe("the demo account's status history", () => {
  it("gives every application a trail that passes through the stages", async () => {
    await seedDemo();
    // A lead nobody has applied to yet is legitimately one row,
    // (NULL → 'interested'), so the question is not "how many rows" but
    // "does the only row explain the status it landed on". Anything past
    // 'interested' has to have been reached from somewhere.
    const { results } = await env.DB.prepare(
      `SELECT applications.id, applications.title, COUNT(status_history.id) AS rows,
              MIN(status_history.to_status) AS only_status
         FROM applications
         LEFT JOIN status_history
           ON status_history.application_id = applications.id
          AND status_history.user_id = applications.user_id
        WHERE applications.user_id = 'seed-admin'
        GROUP BY applications.id`,
    ).all<{ id: number; title: string; rows: number; only_status: string | null }>();

    expect(results.length, "no demo applications were created").toBeGreaterThan(5);
    const stranded = results
      .filter((r) => r.rows < 2 && r.only_status !== "interested")
      .map((r) => `${r.title} (${r.only_status})`);
    expect(
      stranded,
      "these demo applications land on a status with no route to it",
    ).toEqual([]);
  });

  it("routes every ghosted example through applied, like the bulk ones", async () => {
    // Asserted across all of them rather than by title: the bulk seed also
    // produces a DevOps Engineer, and picking the hand-written one by name
    // would have matched both.
    await seedDemo();
    const { results } = await env.DB.prepare(
      `SELECT status_history.application_id AS app, status_history.to_status
         FROM status_history
         JOIN applications ON applications.id = status_history.application_id
                          AND applications.user_id = status_history.user_id
        WHERE applications.user_id = 'seed-admin'
          AND applications.status = 'ghosted'
        ORDER BY status_history.application_id, status_history.id`,
    ).all<{ app: number; to_status: string }>();

    const trails = new Map<number, string[]>();
    for (const r of results) {
      trails.set(r.app, [...(trails.get(r.app) ?? []), r.to_status]);
    }
    expect(trails.size, "the demo seed has no ghosted application any more").toBeGreaterThan(0);
    for (const [app, trail] of trails) {
      expect(trail, `application ${app} reaches ghosted from nowhere`).toEqual([
        "interested",
        "applied",
        "ghosted",
      ]);
    }
  });
});
