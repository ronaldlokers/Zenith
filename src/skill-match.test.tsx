import { describe, expect, test } from "vitest";
import { deriveVisibleFeedItems, skillMatchCount, sortFilterFeed } from "./skill-match";
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

describe("deriveVisibleFeedItems", () => {
  // Spans all three bands (weak 0, look 1-2, strong 3+) and straddles both
  // band thresholds (0/1 and 2/3) plus a minFit=1 and minFit=3 filter line.
  // ids 1 and 5 tie at match_count 0 to prove within-band stability.
  const items = [
    { id: 1, match_count: 0 }, // weak
    { id: 2, match_count: 3 }, // strong
    { id: 3, match_count: 1 }, // look
    { id: 4, match_count: 4 }, // strong
    { id: 5, match_count: 0 }, // weak
  ];

  test("bands strongest-first, preserving incoming order within a band", () => {
    // newest keeps [1,2,3,4,5]; banding then regroups by band without
    // re-sorting within it, so strong keeps 2 before 4, weak keeps 1 before 5.
    expect(
      deriveVisibleFeedItems(items, "newest", 0, true).map((i) => i.id),
    ).toEqual([2, 4, 3, 1, 5]);
  });

  test("sorts by match, then bands, then re-sorts within band", () => {
    // match-desc first: [4,2,3,1,5] (1 and 5 tie at 0, incoming order kept).
    // That's already band-grouped here, so banding is a no-op on this order
    // — the ordering assertion still pins the composed result exactly.
    expect(
      deriveVisibleFeedItems(items, "match", 0, true).map((i) => i.id),
    ).toEqual([4, 2, 3, 1, 5]);
  });

  test("minFit hides items below the threshold before banding", () => {
    // minFit=1 drops both weak items (0), leaving look+strong to band.
    expect(
      deriveVisibleFeedItems(items, "newest", 1, true).map((i) => i.id),
    ).toEqual([2, 4, 3]);
    // minFit=3 sits on the strong threshold: only 2 and 4 clear it.
    expect(
      deriveVisibleFeedItems(items, "match", 3, true).map((i) => i.id),
    ).toEqual([4, 2]);
  });

  test("showWeak=false folds the weak band away entirely", () => {
    expect(
      deriveVisibleFeedItems(items, "newest", 0, false).map((i) => i.id),
    ).toEqual([2, 4, 3]);
  });

  test("does not mutate the input array", () => {
    const input = [...items];
    deriveVisibleFeedItems(input, "match", 0, false);
    expect(input.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
  });
});
