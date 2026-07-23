import { describe, it, expect } from "vitest";
import { fillTemplate, firstName } from "../src/outreach-templates";

describe("firstName", () => {
  it("takes the first token", () => {
    expect(firstName("Jamie Park")).toBe("Jamie");
    expect(firstName("  Ada  Lovelace ")).toBe("Ada");
    expect(firstName(null)).toBe("");
    expect(firstName("")).toBe("");
  });
});

describe("fillTemplate", () => {
  const vars = {
    first_name: "Jamie",
    name: "Jamie Park",
    company: "Acme",
    role: "Recruiter",
    my_name: "Ada",
  };

  it("substitutes known placeholders", () => {
    expect(
      fillTemplate("Hi {{first_name}}, this is {{my_name}}.", vars),
    ).toBe("Hi Jamie, this is Ada.");
  });

  it("tolerates whitespace in braces", () => {
    expect(fillTemplate("{{ company }} / {{role}}", vars)).toBe(
      "Acme / Recruiter",
    );
  });

  it("collapses a known var with no value to empty", () => {
    expect(fillTemplate("Re: {{company}}", { company: null })).toBe("Re: ");
  });

  it("leaves unknown placeholders intact", () => {
    expect(fillTemplate("Hi {{unknown}}", vars)).toBe("Hi {{unknown}}");
  });
});
