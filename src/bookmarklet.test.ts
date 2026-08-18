import { describe, expect, it } from "vitest";
import { bookmarkletSource, captureJob, captureUrl } from "./bookmarklet";

/** A document built from markup, the way a job board would serve it. */
function docFrom(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head>${html}</head><body></body></html>`,
    "text/html",
  );
}

describe("reading a job posting off the page", () => {
  it("prefers what the page states about itself over what it displays", () => {
    // Structured data is what the board publishes for search engines: the
    // most accurate source, and the least likely to move in a redesign.
    const doc = docFrom(`
      <title>Careers | Northwind</title>
      <meta property="og:title" content="Northwind is hiring" />
      <meta property="og:site_name" content="Northwind Jobs" />
      <script type="application/ld+json">
        {"@type":"JobPosting","title":"Staff Platform Engineer",
         "hiringOrganization":{"name":"Northwind"},
         "url":"https://northwind.example/jobs/42"}
      </script>
    `);
    expect(captureJob(doc, "https://northwind.example/jobs/42?src=email")).toEqual({
      title: "Staff Platform Engineer",
      company: "Northwind",
      url: "https://northwind.example/jobs/42",
    });
  });

  it("falls back through Open Graph to the document title", () => {
    const doc = docFrom(`
      <title>Backend Engineer - Initech</title>
      <meta property="og:site_name" content="Initech" />
    `);
    const job = captureJob(doc, "https://initech.example/j/7");
    expect(job.title).toBe("Backend Engineer - Initech");
    expect(job.company).toBe("Initech");
    expect(job.url).toBe("https://initech.example/j/7");
  });

  it("prefers the canonical address over the one in the bar", () => {
    // A listing URL usually carries tracking parameters that are not part of
    // the posting, and those would be saved forever on the application.
    const doc = docFrom(`
      <title>Role</title>
      <link rel="canonical" href="https://initech.example/j/7" />
    `);
    expect(captureJob(doc, "https://initech.example/j/7?utm_source=news").url).toBe(
      "https://initech.example/j/7",
    );
  });

  it("survives structured data that is broken or not a job", () => {
    // Third-party JSON on a page Zenith does not control. A malformed block
    // must cost nothing — the capture is a head start, not a contract.
    const doc = docFrom(`
      <title>Role at Globex</title>
      <script type="application/ld+json">{ not json </script>
      <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
      <meta property="og:site_name" content="Globex" />
    `);
    expect(captureJob(doc, "https://globex.example/1")).toEqual({
      title: "Role at Globex",
      company: "Globex",
      url: "https://globex.example/1",
    });
  });

  it("reads a posting out of a @graph", () => {
    const doc = docFrom(`
      <title>x</title>
      <script type="application/ld+json">
        {"@graph":[{"@type":"WebSite"},{"@type":"JobPosting","title":"SRE",
          "hiringOrganization":{"name":"Hooli"}}]}
      </script>
    `);
    const job = captureJob(doc, "https://hooli.example/1");
    expect(job.title).toBe("SRE");
    expect(job.company).toBe("Hooli");
  });

  it("reports nothing rather than empty strings when the page says nothing", () => {
    const job = captureJob(docFrom("<title></title>"), "");
    expect(job).toEqual({ title: null, company: null, url: null });
  });
});

describe("the link a capture opens", () => {
  it("carries only the fields that were found", () => {
    const url = captureUrl("https://zenith.example/", {
      title: "SRE",
      company: null,
      url: null,
    });
    expect(url).toBe("https://zenith.example/board?add=job&title=SRE");
  });

  it("escapes what it carries", () => {
    // The captured values are third-party text. They travel as query
    // parameters and land in a form, so an ampersand in a job title must not
    // become another parameter.
    const url = captureUrl("https://zenith.example", {
      title: "R&D Lead",
      company: "A & B",
      url: "https://x.example/j?a=1&b=2",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("title")).toBe("R&D Lead");
    expect(parsed.searchParams.get("company")).toBe("A & B");
    expect(parsed.searchParams.get("url")).toBe("https://x.example/j?a=1&b=2");
  });
});

describe("the bookmarklet itself", () => {
  it("is a self-contained javascript: URL", () => {
    // Deliberately not a loader that fetches its body from Zenith: that would
    // be a remote-code channel into every page it is run on.
    const src = bookmarkletSource("https://zenith.example/");
    expect(src.startsWith("javascript:")).toBe(true);
    expect(src).not.toMatch(/<script|document\.write/i);
    expect(decodeURIComponent(src)).toContain("https://zenith.example/board?");
  });

  it("opens Zenith rather than posting from the page it runs on", () => {
    // The whole security shape: nothing is written from the job board, and
    // no credential travels there. A person confirms in Zenith's own form.
    const src = decodeURIComponent(bookmarkletSource("https://zenith.example"));
    expect(src).toContain("window.open");
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|api\//);
  });
});
