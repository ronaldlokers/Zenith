import { describe, expect, test } from "vitest";
import { skillMatchCount } from "./skill-match";
import type { Skill } from "./types";

const skills = [
  { id: 1, name: "TypeScript" },
  { id: 2, name: "Go" },
  { id: 3, name: "React" },
] as unknown as Skill[];
const cv = new Set(["typescript", "react"]);

describe("skillMatchCount", () => {
  test("counts CV-backed skills mentioned in the JD", () => {
    expect(
      skillMatchCount("We use TypeScript and React daily.", skills, cv),
    ).toBe(2);
  });

  test("ignores skills mentioned but not backed by the CV", () => {
    expect(skillMatchCount("Strong Go experience required.", skills, cv)).toBe(
      0,
    );
  });

  test("matches on word boundaries, not substrings", () => {
    const java = [{ id: 1, name: "Java" }] as unknown as Skill[];
    const cvJava = new Set(["java"]);
    expect(skillMatchCount("Java is required.", java, cvJava)).toBe(1);
    expect(skillMatchCount("JavaScript only.", java, cvJava)).toBe(0);
  });
});
