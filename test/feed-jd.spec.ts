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

  it("returns a server-computed match_count and omits the full description (#446)", async () => {
    // Back a skill with work experience so it counts as CV-backed.
    const skill = await env.DB.prepare(
      "INSERT INTO skills (user_id, name) VALUES ('seed-admin', 'Kubernetes') RETURNING id",
    ).first<{ id: number }>();
    const we = await env.DB.prepare(
      "INSERT INTO work_experience (user_id, company, title, is_current, sort_order) VALUES ('seed-admin', 'Acme', 'SRE', 0, 0) RETURNING id",
    ).first<{ id: number }>();
    await env.DB.prepare(
      "INSERT INTO work_experience_skills (work_experience_id, skill_id, user_id) VALUES (?, ?, 'seed-admin')",
    )
      .bind(we!.id, skill!.id)
      .run();
    await env.DB.prepare(
      "INSERT INTO feed_items (source, external_id, title, company, role_type, description) VALUES ('greenhouse', 'ext-jd-match', 'Platform Engineer', 'Kube Co', 'other', 'You will run Kubernetes clusters. No React here.')",
    ).run();

    const res = await authedFetch(`${BASE}/api/feed`);
    const { items } = await res.json<{
      items: { external_id: string; match_count: number; description?: unknown }[];
    }>();
    const item = items.find((i) => i.external_id === "ext-jd-match");
    expect(item).toBeDefined();
    // "Kubernetes" is CV-backed and mentioned → 1; the payload carries only the
    // count, not the full description.
    expect(item!.match_count).toBe(1);
    expect(item!.description).toBeUndefined();
  });
});
