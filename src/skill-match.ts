import type { Skill } from "./types";

// How many of the user's CV-backed skills a job description mentions — the feed
// "fit" signal. Reuses the JD-keyword-match logic (word-boundary regex, escaped
// skill name). A skill counts only if it appears in the JD AND is backed by the
// user's work experience (cvSkillNames), so the badge reflects real fit.
export function skillMatchCount(
  jd: string,
  skills: Skill[],
  cvSkillNames: Set<string>,
): number {
  const jdLower = jd.toLowerCase();
  return skills.filter((s) => {
    if (!cvSkillNames.has(s.name.toLowerCase())) return false;
    const escaped = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(jdLower);
  }).length;
}

// Feed sort/filter derivation (#444), pure so it's unit-testable apart from the
// component. `newest` keeps the API's chronological order; `match` sorts by fit
// descending (stable — ties keep their incoming order). minFit>0 hides items
// below the threshold. Never mutates the input array.
export function sortFilterFeed<T extends { id: number }>(
  items: T[],
  matchOf: (item: T) => number,
  sortBy: "newest" | "match",
  minFit: number,
): T[] {
  let list = items;
  if (minFit > 0) list = list.filter((i) => matchOf(i) >= minFit);
  if (sortBy === "match")
    list = [...list].sort((a, b) => matchOf(b) - matchOf(a));
  return list;
}
