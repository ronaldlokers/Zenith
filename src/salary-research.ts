// Salary-research shortcuts (#475). Zenith has no market-comp dataset (that
// needs a paid API), so rather than fabricate numbers we link out to where the
// data actually lives, pre-scoped to the company and role. Pure + testable.
export interface SalaryLink {
  key: string;
  labelKey: string;
  url: string;
}

export function salaryResearchLinks(
  company: string | null | undefined,
  role: string | null | undefined,
): SalaryLink[] {
  const c = (company ?? "").trim();
  if (!c) return [];
  const query = [c, (role ?? "").trim()].filter(Boolean).join(" ");
  return [
    {
      key: "levels",
      labelKey: "salary.levels",
      url: `https://www.levels.fyi/?search=${encodeURIComponent(c)}`,
    },
    {
      key: "glassdoor",
      labelKey: "salary.glassdoor",
      url: `https://www.glassdoor.com/Search/results.htm?keyword=${encodeURIComponent(c)}`,
    },
    {
      key: "websearch",
      labelKey: "salary.websearch",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${query} salary`)}`,
    },
  ];
}
