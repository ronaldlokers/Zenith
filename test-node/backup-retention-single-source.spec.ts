import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The delete-account dialog tells someone asking to be erased how long a copy
// of their data can still exist in a backup. That number and the number the
// pruning actually uses have to be the same one, or the app makes a false
// promise at the exact moment it matters most.
//
// So neither side declares it. Both read src/backup-policy.ts, and this fails
// if either grows its own copy back.
const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => readFileSync(`${ROOT}${p}`, "utf8");

describe("the backup retention window", () => {
  it("is declared exactly once", () => {
    expect(read("src/backup-policy.ts")).toMatch(/BACKUP_RETENTION_DAYS = \d+/);
  });

  it("is not re-declared as a literal in the worker", () => {
    // The whole directory, not index.ts by name. runScheduledBackup moved to
    // worker/backup.ts and this failed — correctly in form, for the wrong
    // reason: it was pinning where the constant is read rather than that it
    // is read from one place. Same correction five other specs have needed.
    const worker = readdirSync(`${ROOT}worker`)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => read(`worker/${f}`))
      .join("\n");
    expect(
      worker,
      "no worker file reads BACKUP_RETENTION_DAYS any more",
    ).toContain("BACKUP_RETENTION_DAYS");
    expect(
      worker,
      "a worker file hardcodes a retention number again",
    ).not.toMatch(/BACKUP_RETENTION\s*=\s*\d+/);
  });

  it("is interpolated into the copy rather than written into it", () => {
    // A number typed into en.json and nl.json is two more copies to drift.
    const days = read("src/backup-policy.ts").match(/= (\d+)/)![1];
    for (const locale of ["en", "nl"]) {
      const note = JSON.parse(read(`src/locales/${locale}.json`)).account
        .deleteBackupNote as string;
      expect(note, `${locale} has no backup note`).toBeTruthy();
      expect(note, `${locale} writes the window as prose`).toContain("{{days}}");
      expect(note, `${locale} hardcodes ${days}`).not.toMatch(
        new RegExp(`\\b${days}\\b`),
      );
    }
  });
});
