import { describe, expect, test } from "vitest";
import { displayDomain } from "./format";

// The companies list printed c.website verbatim, so half the rows carried a
// second line of "https://www." protocol noise at ink weight. The full URL is
// not lost: the company detail renders it as a real link (companies.tsx:411),
// so the list only has to say which company this is.
//
// Not a URL parser. It shortens something already stored for display, and the
// stored value is whatever a person typed into a text field — so every branch
// here is about not making that worse.
describe("shortening a website for a list row", () => {
  test("drops the protocol and the www", () => {
    expect(displayDomain("https://www.northwind.example")).toBe("northwind.example");
    expect(displayDomain("http://northwind.example")).toBe("northwind.example");
  });

  test("drops a path, which is never what identifies the company", () => {
    expect(displayDomain("https://northwind.example/careers/engineering")).toBe(
      "northwind.example",
    );
  });

  test("keeps a subdomain that is not www", () => {
    // jobs.northwind.example is a different thing from northwind.example, and
    // guessing otherwise would show the wrong host.
    expect(displayDomain("https://jobs.northwind.example")).toBe(
      "jobs.northwind.example",
    );
  });

  test("copes with what someone actually types", () => {
    // No protocol is the common case in a free-text field, and URL() throws on
    // it. Falling back to the raw string is right: showing nothing, or
    // "Invalid URL", would be worse than showing what they wrote.
    expect(displayDomain("northwind.example")).toBe("northwind.example");
    expect(displayDomain("www.northwind.example/jobs")).toBe("northwind.example");
    expect(displayDomain("not a url at all")).toBe("not a url at all");
  });

  test("gives nothing back for nothing", () => {
    expect(displayDomain(null)).toBe("");
    expect(displayDomain("")).toBe("");
    expect(displayDomain("   ")).toBe("");
  });

  test("does not smuggle a javascript: url through as text", () => {
    // safeHref guards the href on the detail page; this is only ever rendered
    // as text, but a value that looks like a scheme should not be dressed up
    // as a tidy domain either.
    expect(displayDomain("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});

// The list is where this is used, so the list is where it should be asserted —
// a helper that is right and never called would pass every test above.
describe("what the companies list shows", () => {
  test("renders the domain, not the stored URL", async () => {
    const { render, screen } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { CompaniesTab } = await import("./companies");
    await import("./i18n");

    render(
      <MemoryRouter initialEntries={["/companies"]}>
        <CompaniesTab
          companies={[
            {
              id: 1,
              name: "Northwind",
              website: "https://www.northwind.example/careers/engineering",
              location: null,
              notes: null,
              is_agency: 0,
              created_at: "2026-01-01",
              updated_at: "2026-01-01",
            } as never,
          ]}
          contacts={[]}
          applications={[]}
          onChanged={() => Promise.resolve()}
          onDelete={() => {}}
          onError={() => {}}
          notify={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("northwind.example")).toBeTruthy();
    expect(
      screen.queryByText(/https:\/\/www\./),
      "the row still prints the protocol and the www",
    ).toBeNull();
  });
});
