import type { Skill } from "./types";
import { matchBand, MATCH_BANDS } from "./format";

// How many of the user's CV-backed skills a job description mentions — the feed
// "fit" signal. Reuses the JD-keyword-match logic (word-boundary regex, escaped
// skill name). A skill counts only if it appears in the JD AND is backed by the
// user's work experience (cvSkillNames), so the badge reflects real fit.
// \b needs a word character on one side of it, so a skill whose name ends or
// starts with punctuation never has one: "c++" followed by a space has no
// boundary after the second +, and the match silently fails. Measured against
// a job description reading "strong c++ and c# skills, plus .net" — C++, C#
// and .NET all came back unmentioned, so they were neither matched nor
// missing. They vanished from the report and from the feed's fit signal
// entirely, which are some of the most commonly required skills there are.
//
// Lookarounds instead: the character either side must not be a word
// character, which is the same thing \b means where \b works and still holds
// where it does not. "Go" keeps not matching "Google", "R" keeps not matching
// "React".
export function mentionsSkill(jdLower: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "i").test(jdLower);
}

export function skillMatchCount(
  jd: string,
  skills: Skill[],
  cvSkillNames: Set<string>,
): number {
  const jdLower = jd.toLowerCase();
  return skills.filter((s) => {
    if (!cvSkillNames.has(s.name.toLowerCase())) return false;
    return mentionsSkill(jdLower, s.name);
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

// The feed list, derived: sort and filter by fit, drop the weak band when it
// is folded, then re-sort by band alone so the chosen sort survives inside
// each one. Order matters — banding after filtering means minFit decides what
// exists before bands decide where it sits.
//
// Why the list is flat and why weak folds by default are properties of the
// screen, not of this function; FeedTab says both where the state lives.
export function deriveVisibleFeedItems<
  T extends { id: number; match_count: number | null | undefined },
>(items: T[], sortBy: "newest" | "match", minFit: number, showWeak: boolean): T[] {
  const sorted = sortFilterFeed(items, (i) => i.match_count ?? 0, sortBy, minFit);
  const banded = showWeak
    ? sorted
    : sorted.filter((i) => matchBand(i.match_count) !== "weak");
  // A stable sort by band alone, so the chosen sort survives inside it.
  return [...banded].sort(
    (a, b) =>
      MATCH_BANDS.indexOf(matchBand(a.match_count)) -
      MATCH_BANDS.indexOf(matchBand(b.match_count)),
  );
}
