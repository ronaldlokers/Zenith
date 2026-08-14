import { describe, expect, it } from "vitest";
import { recurringGaps, skillDemand } from "./skill-demand";
import type { Application, Skill, WorkExperience } from "./types";

const app = (jd: string | null): Application =>
  ({ id: 1, job_description: jd }) as unknown as Application;
const skill = (name: string): Skill => ({ id: name.length, name }) as Skill;
const exp = (names: string[]): WorkExperience =>
  ({ id: 1, skills: names.map((n) => ({ id: 1, name: n })) }) as unknown as WorkExperience;

describe("what the saved postings ask for", () => {
  it("orders by how many postings ask, not how often a word appears", () => {
    // A posting that says Kubernetes six times is still one employer asking.
    // Counting mentions would rank a single verbose posting above a skill
    // three different employers want.
    const apps = [
      app("kubernetes kubernetes kubernetes kubernetes kubernetes kubernetes"),
      app("we use terraform"),
      app("terraform please"),
      app("terraform and go"),
    ];
    const { demand, postings } = skillDemand(
      apps,
      [skill("Kubernetes"), skill("Terraform")],
      [],
    );
    expect(postings).toBe(4);
    expect(demand.map((d) => [d.name, d.asked])).toEqual([
      ["Terraform", 3],
      ["Kubernetes", 1],
    ]);
  });

  it("ignores applications with no description saved", () => {
    const { postings } = skillDemand([app(null), app("  "), app("go")], [skill("Go")], []);
    expect(postings, "an empty description counted as a posting that asks for nothing").toBe(1);
  });

  it("separates what the CV backs from what it does not", () => {
    const apps = [app("terraform and go"), app("terraform")];
    const { gaps } = recurringGaps(
      apps,
      [skill("Terraform"), skill("Go")],
      [exp(["Go"])],
    );
    expect(
      gaps.map((g) => g.name),
      "a skill evidenced in the work history was reported as a gap",
    ).toEqual(["Terraform"]);
  });

  it("matches on whole words, so MySQL is not SQL experience", () => {
    // The same boundary rule the per-posting report uses. Without it this
    // list is worse than nothing: it would tell someone to learn a skill the
    // postings never asked for.
    const { demand } = skillDemand([app("we run mysql")], [skill("SQL")], []);
    expect(demand).toEqual([]);
  });

  it("says nothing at all when no description has been saved", () => {
    const { gaps, postings } = recurringGaps([app(null)], [skill("Go")], []);
    expect(gaps).toEqual([]);
    expect(postings).toBe(0);
  });
});
