import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// workerd treats every named export of the entry module as a service
// entrypoint, so a non-function export there stops the Worker starting at all:
//
//   Uncaught TypeError: Incorrect type for map entry
//   'EXPORT_DOCUMENT_BUDGET_BYTES': the provided value is not of type
//   'function or ExportedHandler'.
//
// That is a deploy-breaking change that `tsc -b`, `npm run build`, oxlint and
// the entire unit suite all pass. Only booting the real Worker catches it, and
// the e2e layer only caught it here because a stale process on port 8799 sent
// me looking.
//
// Functions are fine and there are several: buildFullExport, runScheduledBackup,
// shouldRunFeedPull, compensationError. Constants, types and interfaces belong
// in a module the entry file imports from — worker/export-documents.ts exists
// for exactly that reason.
const ROOT = new URL("..", import.meta.url).pathname;
const INDEX = readFileSync(`${ROOT}worker/index.ts`, "utf8");

describe("worker/index.ts's named exports", () => {
  it("are all functions", () => {
    // `export interface` / `export type` are erased before workerd sees the
    // module, so they are not entrypoints and not a problem.
    const offenders = [...INDEX.matchAll(/^export\s+(?!default\b)(\w+)\s+(\w+)/gm)]
      .filter(([, kind]) => !["function", "async", "interface", "type"].includes(kind))
      .map(([, kind, name]) => `${kind} ${name}`);

    expect(
      offenders,
      "workerd will refuse to start: a named export of the entry module must be a function",
    ).toEqual([]);
  });

  it("found the exports it is checking", () => {
    // If the pattern stops matching, the test above passes on an empty list.
    const exports = [...INDEX.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)];
    expect(exports.length).toBeGreaterThan(2);
  });
});
