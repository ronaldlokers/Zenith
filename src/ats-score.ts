import type { Profile, Skill, WorkExperience } from "./types";

// Deterministic, key-free ATS report (#470). Scores the built CV against a
// pasted job description: keyword coverage (which of the JD-mentioned skills
// the CV actually backs) plus content-quality checks recruiters/ATS look for.
// Pure so it's unit-testable apart from the component; reuses the same
// word-boundary skill match as skill-match.ts / JdKeywordMatch.

export type AtsBand = "strong" | "fair" | "weak";

export interface AtsCheckKey {
  key: "summary" | "experience" | "quantified" | "contact" | "skillsLinked";
  passed: boolean;
}

export interface AtsReport {
  score: number; // 0–100 overall
  band: AtsBand;
  keywordScore: number; // 0–100 coverage of JD-mentioned skills
  matched: string[]; // JD-mentioned skills backed by the CV
  missing: string[]; // JD-mentioned skills NOT backed by the CV
  checks: AtsCheckKey[];
}

export function atsBand(score: number): AtsBand {
  if (score >= 75) return "strong";
  if (score >= 50) return "fair";
  return "weak";
}

function mentionsSkill(jdLower: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(jdLower);
}

export function atsReport(
  jd: string,
  skills: Skill[],
  workExp: WorkExperience[],
  profile: Profile | null,
): AtsReport {
  const cvSkillNames = new Set(
    workExp.flatMap((w) => w.skills.map((s) => s.name.toLowerCase())),
  );
  const jdLower = jd.toLowerCase();
  const mentioned = skills.filter((s) => mentionsSkill(jdLower, s.name));
  const matched = mentioned.filter((s) =>
    cvSkillNames.has(s.name.toLowerCase()),
  );
  const missing = mentioned.filter(
    (s) => !cvSkillNames.has(s.name.toLowerCase()),
  );
  const keywordScore = mentioned.length
    ? Math.round((matched.length / mentioned.length) * 100)
    : 0;

  const checks: AtsCheckKey[] = [
    {
      key: "summary",
      passed: (profile?.summary?.trim().length ?? 0) >= 40,
    },
    {
      key: "experience",
      passed:
        workExp.length > 0 &&
        workExp.every((w) => (w.description ?? "").trim().length > 0),
    },
    {
      key: "quantified",
      passed: workExp.some((w) => /\d/.test(w.description ?? "")),
    },
    {
      key: "contact",
      passed: !!profile?.email && !!(profile?.phone || profile?.linkedin),
    },
    { key: "skillsLinked", passed: cvSkillNames.size >= 5 },
  ];
  const contentScore = Math.round(
    (checks.filter((c) => c.passed).length / checks.length) * 100,
  );

  // Keyword coverage is the headline signal (weight 0.65); content quality
  // rounds it out (0.35). With no JD skills detected, coverage is meaningless,
  // so fall back to the content score alone.
  const score = mentioned.length
    ? Math.round(keywordScore * 0.65 + contentScore * 0.35)
    : contentScore;

  return {
    score,
    band: atsBand(score),
    keywordScore,
    matched: matched.map((s) => s.name),
    missing: missing.map((s) => s.name),
    checks,
  };
}
