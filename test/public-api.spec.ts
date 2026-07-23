import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Own file (#285): generating an API key writes to the profile row, which
// would clobber api.spec's "profile starts empty" expectation. Storage is
// isolated per file.
const BASE = "http://zenith.test";

async function apiKey(): Promise<string> {
  const r = await authedFetch(`${BASE}/api/profile/api-key`, { method: "POST" });
  return ((await r.json()) as { api_key: string }).api_key;
}

async function seedApp(overrides: Record<string, unknown> = {}) {
  const r = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Platform Engineer",
      role_type: "platform-engineer",
      ...overrides,
    }),
  });
  return (await r.json()) as { id: number };
}

describe("public v1 API", () => {
  it("rejects a request with no bearer token", async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/applications`);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid key", async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/applications`, {
      headers: { Authorization: "Bearer not-a-real-key" },
    });
    expect(res.status).toBe(401);
  });

  it("lists the user's applications and never exposes salary", async () => {
    const key = await apiKey();
    const app = await seedApp({ salary_min: 90000, salary_max: 120000 });
    const res = await SELF.fetch(`${BASE}/api/v1/applications`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Record<string, unknown>[];
    const found = list.find((a) => a.id === app.id);
    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty("salary_min");
    expect(found).not.toHaveProperty("salary_max");
  });

  it("bounds the list with limit + offset", async () => {
    const key = await apiKey();
    await seedApp();
    await seedApp();
    const res = await SELF.fetch(`${BASE}/api/v1/applications?limit=1`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as unknown[];
    expect(list.length).toBe(1);
  });

  it("gets one by id and 404s for an unknown id", async () => {
    const key = await apiKey();
    const app = await seedApp();
    const ok = await SELF.fetch(`${BASE}/api/v1/applications/${app.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(ok.status).toBe(200);
    const miss = await SELF.fetch(`${BASE}/api/v1/applications/99999999`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(miss.status).toBe(404);
  });
});

describe("webhooks", () => {
  it("creates (with a secret), lists, and deletes", async () => {
    const created = await authedFetch(`${BASE}/api/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/hook" }),
    });
    expect(created.status).toBe(201);
    const hook = (await created.json()) as { id: number; secret: string };
    expect(hook.secret).toBeTruthy();

    const list = (await (
      await authedFetch(`${BASE}/api/webhooks`)
    ).json()) as { id: number }[];
    expect(list.some((w) => w.id === hook.id)).toBe(true);

    const del = await authedFetch(`${BASE}/api/webhooks/${hook.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
  });

  it("rejects a non-https webhook url", async () => {
    const res = await authedFetch(`${BASE}/api/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://insecure.example/hook" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates an application from the extension (find-or-creates company)", async () => {
    const key = await apiKey();
    const res = await SELF.fetch(`${BASE}/api/v1/applications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Staff Engineer",
        company: "Ext Co",
        url: "https://boards.example/job/1",
        source: "extension",
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json<{
      id: number;
      title: string;
      company_id: number | null;
      source: string;
      status: string;
    }>();
    expect(created.title).toBe("Staff Engineer");
    expect(created.company_id).not.toBeNull();
    expect(created.source).toBe("extension");
    expect(created.status).toBe("interested");

    // A second save with the same company name reuses the company.
    const res2 = await SELF.fetch(`${BASE}/api/v1/applications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Another Role", company: "Ext Co" }),
    });
    const created2 = await res2.json<{ company_id: number | null }>();
    expect(created2.company_id).toBe(created.company_id);
  });

  it("rejects an extension save with no title", async () => {
    const key = await apiKey();
    const res = await SELF.fetch(`${BASE}/api/v1/applications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ company: "Nameless" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an extension save with no key", async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("ssrf + export guards (#346)", () => {
  it("rejects a webhook pointing at a forbidden host", async () => {
    const res = await authedFetch(`${BASE}/api/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://169.254.169.254/hook" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects importing from a private address", async () => {
    const res = await authedFetch(
      `${BASE}/api/import?url=${encodeURIComponent("http://127.0.0.1:8787/x")}`,
    );
    expect(res.status).toBe(400);
  });

  it("neutralizes formula-leading cells in CSV export", async () => {
    await authedFetch(`${BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "=HYPERLINK(\"http://evil\")" }),
    });
    const csv = await (await authedFetch(`${BASE}/api/export/applications`)).text();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/^=|[,\n]=/);
  });
});
