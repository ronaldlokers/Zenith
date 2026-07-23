import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";
import { stripHtml } from "../worker/feed";

const BASE = "http://zenith.test";

describe("feed job-description capture", () => {
  it("stripHtml flattens HTML to readable plain text", () => {
    const out = stripHtml(
      "<p>Hello <strong>world</strong></p><ul><li>a</li><li>b</li></ul>Cats &amp; dogs",
    );
    expect(out).toContain("Hello world");
    expect(out).toContain("• a");
    expect(out).toContain("Cats & dogs");
    expect(out).not.toContain("<");
  });

  it("carries the feed item's description into the new application", async () => {
    const { meta } = await env.DB.prepare(
      "INSERT INTO feed_items (source, external_id, title, company, role_type, description) VALUES ('greenhouse', 'ext-jd-1', 'Backend Engineer', 'Acme', 'other', 'Full job description here.')",
    ).run();
    const res = await authedFetch(`${BASE}/api/feed/${meta.last_row_id}/add`, {
      method: "POST",
    });
    expect(res.status).toBe(201);
    const app = await res.json<{
      job_description: string | null;
      job_description_captured_at: string | null;
    }>();
    expect(app.job_description).toBe("Full job description here.");
    expect(app.job_description_captured_at).not.toBeNull();
  });

  it("leaves job_description null when the feed item has none", async () => {
    const { meta } = await env.DB.prepare(
      "INSERT INTO feed_items (source, external_id, title, company, role_type) VALUES ('adzuna', 'ext-jd-2', 'Role', 'Beta', 'other')",
    ).run();
    const res = await authedFetch(`${BASE}/api/feed/${meta.last_row_id}/add`, {
      method: "POST",
    });
    expect(res.status).toBe(201);
    const app = await res.json<{
      job_description: string | null;
      job_description_captured_at: string | null;
    }>();
    expect(app.job_description).toBeNull();
    expect(app.job_description_captured_at).toBeNull();
  });
});
