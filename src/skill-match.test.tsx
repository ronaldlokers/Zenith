import { describe, expect, test } from "vitest";
import { skillMatchCount, sortFilterFeed } from "./skill-match";
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

describe("sortFilterFeed", () => {
  const items = [
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 4 },
  ];
  const match: Record<number, number> = { 1: 0, 2: 3, 3: 1, 4: 3 };
  const matchOf = (i: { id: number }) => match[i.id];

  test("newest keeps the incoming order untouched", () => {
    expect(sortFilterFeed(items, matchOf, "newest", 0).map((i) => i.id)).toEqual(
      [1, 2, 3, 4],
    );
  });

  test("match sorts by fit descending, stable on ties", () => {
    // 2 and 4 both score 3 — their incoming order (2 before 4) is preserved.
    expect(sortFilterFeed(items, matchOf, "match", 0).map((i) => i.id)).toEqual(
      [2, 4, 3, 1],
    );
  });

  test("minFit hides items below the threshold", () => {
    expect(sortFilterFeed(items, matchOf, "newest", 1).map((i) => i.id)).toEqual(
      [2, 3, 4],
    );
    expect(sortFilterFeed(items, matchOf, "match", 3).map((i) => i.id)).toEqual(
      [2, 4],
    );
  });

  test("does not mutate the input array", () => {
    const input = [...items];
    sortFilterFeed(input, matchOf, "match", 0);
    expect(input.map((i) => i.id)).toEqual([1, 2, 3, 4]);
  });
});
