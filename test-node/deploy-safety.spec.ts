import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A migration reaches production the moment it merges — deploy.yml applies it
// unconditionally on push to main — and D1 migrations are one-directional:
// there is not a single down file in migrations/. So the only thing standing
// between a bad migration and lost data is a copy taken before it ran.
//
// The nightly backup is up to 24 hours stale by the time a deploy happens, and
// #660 gave it a restore path but nothing pins the snapshot to the migration
// itself. This does.
const ROOT = new URL("..", import.meta.url).pathname;
const DEPLOY = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");

const stepOrder = (): string[] =>
  [...DEPLOY.matchAll(/^\s+- name: (.+)$/gm)].map((m) => m[1].trim());

describe("the deploy workflow", () => {
  it("snapshots the database before it migrates it", () => {
    const steps = stepOrder();
    const snapshot = steps.findIndex((s) => /snapshot the database/i.test(s));
    const migrate = steps.findIndex((s) => /apply d1 migrations/i.test(s));
    expect(snapshot, "no pre-migration snapshot step").toBeGreaterThanOrEqual(0);
    expect(migrate, "the migrate step has moved or been renamed").toBeGreaterThanOrEqual(0);
    expect(
      snapshot,
      "the snapshot must run before the migration, or it is a copy of the damage",
    ).toBeLessThan(migrate);
  });

  it("sends the snapshot to R2 rather than a workflow artifact", () => {
    // The load-bearing one. This repository is public, so a workflow artifact
    // holding the production database would be downloadable by anyone who can
    // open the Actions tab — every user's applications, compensation figures,
    // private interview notes and contact details. "Upload it as an artifact"
    // is the obvious next convenience and it would be a data breach.
    expect(DEPLOY).toMatch(/wrangler r2 object put/);
    expect(
      DEPLOY,
      "deploy.yml uploads an artifact; the database must never leave R2",
    ).not.toMatch(/upload-artifact/);
  });

  it("only pays for the export when a migration is actually pending", () => {
    // An export reads every row and D1's free tier meters row reads. Most
    // deploys carry no migration at all.
    expect(DEPLOY).toMatch(/migrations list/);
    expect(DEPLOY).toMatch(/if:\s*steps\.pending\.outputs\.any == 'true'/);
  });

  it("still has no down migrations, which is why the snapshot matters", () => {
    // The premise the whole step rests on. If reversible migrations ever
    // arrive, revisit this rather than deleting it — but today a snapshot is
    // the only way back from a migration that did the wrong thing.
    const down = readdirSync(join(ROOT, "migrations")).filter((f) =>
      /(down|revert|rollback)/i.test(f),
    );
    expect(down, "down migrations exist now — the rollback story has changed").toEqual([]);
  });
});
