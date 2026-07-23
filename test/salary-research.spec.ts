import { describe, it, expect } from "vitest";
import { salaryResearchLinks } from "../src/salary-research";

describe("salaryResearchLinks", () => {
  it("returns nothing without a company", () => {
    expect(salaryResearchLinks(null, "Engineer")).toEqual([]);
    expect(salaryResearchLinks("  ", "Engineer")).toEqual([]);
  });

  it("builds company-scoped links", () => {
    const links = salaryResearchLinks("Acme Cloud", "Platform Engineer");
    const byKey = Object.fromEntries(links.map((l) => [l.key, l.url]));
    expect(byKey.levels).toContain("levels.fyi/?search=Acme%20Cloud");
    expect(byKey.glassdoor).toContain("keyword=Acme%20Cloud");
    expect(byKey.websearch).toContain(
      "Acme%20Cloud%20Platform%20Engineer%20salary",
    );
  });

  it("omits the role from the search when absent", () => {
    const links = salaryResearchLinks("Acme", null);
    expect(links.find((l) => l.key === "websearch")!.url).toContain(
      "Acme%20salary",
    );
  });
});
