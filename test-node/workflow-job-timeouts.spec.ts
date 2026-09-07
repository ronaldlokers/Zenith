import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// GitHub's default job timeout is 360 minutes — six hours a runner can sit
// held by a step that will never finish. This repo's e2e layer runs a real
// Chromium against `wrangler dev`, and has already hit a stale `workerd`
// holding its port and a URL that never came up: exactly the failure mode
// that hangs instead of failing. Every job needs its own ceiling.
//
// Reads the workflows directory rather than naming files, so a new workflow
// is covered without anyone remembering to add it here.
const ROOT = new URL("..", import.meta.url).pathname;
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");

// Line-based, not a real YAML parser — none is a project dependency (see
// dependency-automation.spec.ts's neighbours; nothing here pulls in js-yaml).
// A job key sits at exactly two spaces of indent under `jobs:` (`  checks:`);
// a job-level field sits at exactly four spaces (`    timeout-minutes: 30`).
// A step-level `timeout-minutes:` sits under `steps:`, indented six spaces
// or more (steps are list items, and their fields nest deeper still) — that
// must NOT satisfy the check for the job that contains it.
function findJobs(content: string): { name: string; hasTimeout: boolean }[] {
  const lines = content.split("\n");
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsIdx === -1) return [];

  const jobs: { name: string; hasTimeout: boolean }[] = [];
  let i = jobsIdx + 1;
  while (i < lines.length) {
    const line = lines[i];
    // End of the jobs block: a non-blank, non-comment line back at column 0.
    if (/^\S/.test(line) && !/^\s*#/.test(line)) break;

    const jobMatch = /^ {2}([A-Za-z0-9_.-]+):\s*(#.*)?$/.exec(line);
    if (jobMatch) {
      const name = jobMatch[1];
      let hasTimeout = false;
      let j = i + 1;
      // Scan the job's body: every line indented deeper than 2 spaces,
      // stopping at the next job key (indent === 2) or end of file.
      while (j < lines.length) {
        const bodyLine = lines[j];
        if (/^\S/.test(bodyLine) && !/^\s*#/.test(bodyLine)) break; // end of jobs block
        if (/^ {2}[A-Za-z0-9_.-]+:\s*(#.*)?$/.test(bodyLine)) break; // next job
        if (/^ {4}timeout-minutes:\s*\d+/.test(bodyLine)) hasTimeout = true;
        j++;
      }
      jobs.push({ name, hasTimeout });
      i = j;
      continue;
    }
    i++;
  }
  return jobs;
}

describe("every workflow job declares timeout-minutes", () => {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  it("found at least one workflow file to check", () => {
    expect(files.length, `no workflow files found under ${WORKFLOWS_DIR}`).toBeGreaterThan(0);
  });

  const jobsByFile = files.map((file) => ({
    file,
    jobs: findJobs(readFileSync(join(WORKFLOWS_DIR, file), "utf8")),
  }));

  it("finds a nonzero, plausible number of jobs across the workflows", () => {
    // Guards against the parser silently matching nothing (an indentation
    // assumption that's wrong, a `jobs:` block it fails to locate) and the
    // per-job assertions below passing vacuously over an empty list.
    const total = jobsByFile.reduce((sum, { jobs }) => sum + jobs.length, 0);
    const filesWithJobs = jobsByFile.filter(({ jobs }) => jobs.length > 0).length;
    expect(total, "no jobs found across any workflow — has the format changed?").toBeGreaterThan(0);
    expect(filesWithJobs, "expected at least one workflow file to declare a job").toBeGreaterThan(0);
  });

  it("names every job missing timeout-minutes", () => {
    const missing: string[] = [];
    for (const { file, jobs } of jobsByFile) {
      for (const job of jobs) {
        if (!job.hasTimeout) missing.push(`${file}: job "${job.name}"`);
      }
    }
    expect(
      missing,
      "these jobs have no timeout-minutes, so a hung step (e.g. e2e against a wrangler dev that never comes up) can hold a runner for GitHub's 360-minute default",
    ).toEqual([]);
  });
});
