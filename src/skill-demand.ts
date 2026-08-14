import { mentionsSkill } from "./skill-match";
import type { Application, Skill, WorkExperience } from "./types";

// Which gaps actually matter, across the whole search rather than one posting
// at a time.
//
// The per-application report already names the skills a posting asks for that
// no work-experience entry backs. Read one at a time that is a list of things
// to maybe fix; read across every posting saved, it is an ordering — the same
// method the keyword tools use, which count how often a term appears across
// postings for a role, with the addition that this one already knows what is
// on the CV and can subtract it.
//
// It is aimed at a specific failure: job seekers who cannot identify which
// gaps are costing them tend to conclude the field is wrong for them rather
// than that a skill is missing. An ordering answers that where a per-posting
// list does not.
//
// Only counts skills already on the account. A skill nobody has listed cannot
// be found in a posting without a taxonomy of skill names to look for, and
// inventing one would mean guessing at what counts as a skill — so this
// deliberately answers "which of the things you know about are asked for and
// unevidenced" rather than pretending to discover unknown ones.
export interface SkillDemand {
  name: string;
  /** Postings, of those with a description saved, that ask for it. */
  asked: number;
  /** Whether any work-experience entry lists it. */
  backed: boolean;
}

export function skillDemand(
  applications: Application[],
  skills: Skill[],
  workExp: WorkExperience[],
): { demand: SkillDemand[]; postings: number } {
  const described = applications
    .map((a) => a.job_description)
    .filter((jd): jd is string => !!jd && jd.trim().length > 0)
    .map((jd) => jd.toLowerCase());
  if (!described.length) return { demand: [], postings: 0 };

  const backedNames = new Set(
    workExp.flatMap((w) => (w.skills ?? []).map((s) => s.name.toLowerCase())),
  );

  const demand = skills
    .map((s) => ({
      name: s.name,
      asked: described.filter((jd) => mentionsSkill(jd, s.name)).length,
      backed: backedNames.has(s.name.toLowerCase()),
    }))
    .filter((d) => d.asked > 0)
    // Most asked first; a stable tiebreak by name so the list does not
    // reshuffle between renders for skills asked for equally often.
    .sort((a, b) => b.asked - a.asked || a.name.localeCompare(b.name));

  return { demand, postings: described.length };
}

/** The unevidenced ones, most-asked first — the gaps worth closing. */
export function recurringGaps(
  applications: Application[],
  skills: Skill[],
  workExp: WorkExperience[],
): { gaps: SkillDemand[]; postings: number } {
  const { demand, postings } = skillDemand(applications, skills, workExp);
  return { gaps: demand.filter((d) => !d.backed), postings };
}
