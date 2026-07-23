import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAdzuna, fetchAshby, fetchGreenhouse } from "../worker/feed";

// Provider-parsing coverage (#449): each source maps a different JSON shape
// into a FeedCandidate, and the description-capture rules (Greenhouse HTML
// flatten, Ashby plain-vs-HTML fallback + 8000-char cap, Adzuna snippet) had
// no test — a provider schema drift would silently break capture.

function stub(json: unknown, ok = true) {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(json), { status: ok ? 200 : 500 }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchGreenhouse", () => {
  it("maps the board JSON and flattens the HTML description", async () => {
    stub({
      jobs: [
        {
          id: 42,
          title: "Platform Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/42",
          location: { name: "Remote" },
          updated_at: "2026-07-01T00:00:00Z",
          content: "<p>Run <strong>Kubernetes</strong></p><ul><li>a</li></ul>",
        },
      ],
    });
    const [c] = await fetchGreenhouse("acme", {});
    expect(c.source).toBe("greenhouse");
    expect(c.external_id).toBe("42"); // numeric id stringified
    expect(c.company).toBe("acme");
    expect(c.board_slug).toBe("acme");
    expect(c.description).toContain("Run Kubernetes");
    expect(c.description).toContain("• a");
    expect(c.description).not.toContain("<");
  });

  it("returns [] on a non-ok response", async () => {
    stub({}, false);
    expect(await fetchGreenhouse("acme", {})).toEqual([]);
  });
});

describe("fetchAshby", () => {
  it("prefers descriptionPlain and caps it at 8000 chars", async () => {
    const long = "K".repeat(9000);
    stub({
      jobs: [
        {
          id: "ab1",
          title: "SRE",
          jobUrl: "https://jobs.ashbyhq.com/acme/ab1",
          location: "Remote",
          publishedAt: "2026-07-01",
          descriptionPlain: long,
          descriptionHtml: "<p>ignored</p>",
        },
      ],
    });
    const [c] = await fetchAshby("acme", {});
    expect(c.external_id).toBe("ab1");
    expect(c.description).toHaveLength(8000);
  });

  it("falls back to flattened HTML when no plain description", async () => {
    stub({
      jobs: [
        {
          id: "ab2",
          title: "SRE",
          descriptionHtml: "<p>Hello <b>world</b></p>",
        },
      ],
    });
    const [c] = await fetchAshby("acme", {});
    expect(c.description).toBe("Hello world");
  });
});

describe("fetchAdzuna", () => {
  const env = {
    ADZUNA_APP_ID: "id",
    ADZUNA_APP_KEY: "key",
  } as unknown as Parameters<typeof fetchAdzuna>[0];

  it("maps results, formats salary, and tags the role", async () => {
    stub({
      results: [
        {
          id: "z1",
          title: "Backend Engineer",
          company: { display_name: "Beta" },
          location: { display_name: "Amsterdam" },
          redirect_url: "https://adzuna/z1",
          salary_min: 60000.4,
          salary_max: 80000.6,
          created: "2026-07-01",
          description: "Short snippet.",
        },
      ],
    });
    const out = await fetchAdzuna(env, { engineering: ["backend"] }, "nl");
    expect(out).toHaveLength(1);
    expect(out[0].role_type).toBe("engineering");
    expect(out[0].salary_text).toBe("€60000-80001");
    expect(out[0].description).toBe("Short snippet.");
  });

  it("returns [] without API credentials", async () => {
    const empty = {} as unknown as Parameters<typeof fetchAdzuna>[0];
    expect(await fetchAdzuna(empty, { engineering: ["backend"] }, "nl")).toEqual(
      [],
    );
  });
});
