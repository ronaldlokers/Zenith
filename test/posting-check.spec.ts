import { describe, expect, it } from "vitest";
import { looksStale } from "../worker/posting-check";

describe("looksStale", () => {
  it("flags a 404", () => {
    expect(looksStale(404, "https://example.com/jobs/1", "https://example.com/jobs/1")).toBe(true);
  });

  it("flags a 410 gone", () => {
    expect(looksStale(410, "https://example.com/jobs/1", "https://example.com/jobs/1")).toBe(true);
  });

  it("flags any 4xx/5xx", () => {
    expect(looksStale(500, "https://example.com/jobs/1", "https://example.com/jobs/1")).toBe(true);
  });

  it("does not flag a clean 200 with no redirect", () => {
    expect(looksStale(200, "https://example.com/jobs/1", "https://example.com/jobs/1")).toBe(false);
  });

  it("flags a redirect that collapses to a bare top-level page", () => {
    expect(
      looksStale(
        200,
        "https://example.com/jobs/senior-platform-engineer-12345",
        "https://example.com/jobs",
      ),
    ).toBe(true);
  });

  it("does not flag a redirect to another deep, similarly-sized path", () => {
    expect(
      looksStale(
        200,
        "https://example.com/jobs/senior-platform-engineer-12345",
        "https://example.com/careers/senior-platform-engineer-12345",
      ),
    ).toBe(false);
  });

  it("does not throw on a malformed final URL", () => {
    expect(looksStale(200, "https://example.com/jobs/1", "not a url")).toBe(false);
  });
});
