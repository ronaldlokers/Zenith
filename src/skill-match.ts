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
