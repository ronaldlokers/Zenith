import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

const BASE = "http://jobseekr.test";

async function post(path: string, body: unknown) {
  return authedFetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedCompany(name = "Acme") {
  const res = await post("/api/companies", { name });
  return (await res.json()) as { id: number };
}

async function seedApplication(overrides: Record<string, unknown> = {}) {
  const res = await post("/api/applications", {
    title: "Platform Engineer",
    role_type: "platform-engineer",
    ...overrides,
  });
  return (await res.json()) as { id: number };
}

describe("saved views", () => {
  it("creates, lists, and deletes a named filter snapshot", async () => {
    const filters = {
      query: "platform",
      statusFilter: "applied",
      roleFilter: "all",
      companyFilter: "all",
      tagFilter: "all",
      showArchived: false,
      sort: "updated",
    };
    const created = (await (
      await post("/api/saved-views", { name: "Interviewing", filters })
    ).json()) as { id: number; name: string; filters: typeof filters };
    expect(created.name).toBe("Interviewing");
    expect(created.filters.statusFilter).toBe("applied");

    const list = (await (
      await authedFetch(`${BASE}/api/saved-views`)
    ).json()) as { id: number; filters: typeof filters }[];
    const found = list.find((v) => v.id === created.id);
    expect(found?.filters.query).toBe("platform");

    const del = await authedFetch(`${BASE}/api/saved-views/${created.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    const after = (await (
      await authedFetch(`${BASE}/api/saved-views`)
    ).json()) as { id: number }[];
    expect(after.some((v) => v.id === created.id)).toBe(false);
  });

  it("rejects a view with no name", async () => {
    const res = await post("/api/saved-views", { filters: {} });
    expect(res.status).toBe(400);
  });
});

describe("admin: reset 2FA", () => {
  it("clears a user's TOTP secret and disables 2FA", async () => {
    const u = await env.DB.prepare(
      'SELECT id FROM "user" WHERE email = ?',
    )
      .bind("ronald@lokers.email")
      .first<{ id: string }>();
    await env.DB.prepare(
      'INSERT INTO "twoFactor" (id, secret, "backupCodes", "userId") VALUES (?, ?, ?, ?)',
    )
      .bind("tf-test", "SECRET123", "[]", u!.id)
      .run();
    await env.DB.prepare('UPDATE "user" SET "twoFactorEnabled" = 1 WHERE id = ?')
      .bind(u!.id)
      .run();

    const res = await authedFetch(
      `${BASE}/api/admin/users/${u!.id}/reset-2fa`,
      { method: "POST" },
    );
    expect(res.status).toBe(204);

    const tf = await env.DB.prepare(
      'SELECT id FROM "twoFactor" WHERE "userId" = ?',
    )
      .bind(u!.id)
      .first();
    expect(tf).toBeNull();
    const usr = await env.DB.prepare(
      'SELECT "twoFactorEnabled" AS e FROM "user" WHERE id = ?',
    )
      .bind(u!.id)
      .first<{ e: number }>();
    expect(usr!.e).toBe(0);
  });

  it("404s for an unknown user", async () => {
    const res = await authedFetch(`${BASE}/api/admin/users/nope/reset-2fa`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

describe("request validation", () => {
  it("returns 400 (not 500) for a malformed JSON body", async () => {
    const res = await authedFetch(`${BASE}/api/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json",
    });
    expect(res.status).toBe(400);
  });
});

describe("companies", () => {
  it("creates, lists, updates, deletes", async () => {
    const created = await post("/api/companies", {
      name: "Acme",
      website: "https://acme.example",
      is_agency: true,
    });
    expect(created.status).toBe(201);
    const company = (await created.json()) as {
      id: number;
      is_agency: number;
    };
    expect(company.is_agency).toBe(1);

    const list = await authedFetch(`${BASE}/api/companies`);
    expect(((await list.json()) as unknown[]).length).toBe(1);

    const updated = await authedFetch(`${BASE}/api/companies/${company.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme BV" }),
    });
    expect(((await updated.json()) as { name: string }).name).toBe("Acme BV");

    const del = await authedFetch(`${BASE}/api/companies/${company.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
  });

  it("rejects a company without a name", async () => {
    const res = await post("/api/companies", {});
    expect(res.status).toBe(400);
  });
});

describe("contacts", () => {
  it("joins the company name in the list", async () => {
    const company = await seedCompany();
    await post("/api/contacts", {
      name: "Jane",
      company_id: company.id,
      role: "Recruiter",
    });
    const list = await authedFetch(`${BASE}/api/contacts`);
    const [contact] = (await list.json()) as { company_name: string }[];
    expect(contact.company_name).toBe("Acme");
  });

  it("rejects a contact without a name", async () => {
    const res = await post("/api/contacts", { role: "Recruiter" });
    expect(res.status).toBe(400);
  });
});

describe("applications", () => {
  it("creates with defaults and validates enums", async () => {
    const created = await post("/api/applications", { title: "DevOps" });
    expect(created.status).toBe(201);
    const app = (await created.json()) as { status: string; role_type: string };
    expect(app.status).toBe("interested");
    expect(app.role_type).toBe("other");

    const badStatus = await post("/api/applications", {
      title: "x",
      status: "bogus",
    });
    expect(badStatus.status).toBe(400);

    const noTitle = await post("/api/applications", {});
    expect(noTitle.status).toBe(400);
  });

  it("persists a referral link and surfaces the referrer's name", async () => {
    const contact = await post("/api/contacts", { name: "Jordan Referrer" });
    const { id: contactId } = (await contact.json()) as { id: number };

    const created = await post("/api/applications", {
      title: "Referred Role",
      referred_by_contact_id: contactId,
    });
    expect(created.status).toBe(201);
    const app = (await created.json()) as { referred_by_contact_id: number };
    expect(app.referred_by_contact_id).toBe(contactId);

    const list = await authedFetch(`${BASE}/api/applications`);
    const apps = (await list.json()) as {
      title: string;
      referred_by_name: string | null;
    }[];
    const referred = apps.find((a) => a.title === "Referred Role");
    expect(referred?.referred_by_name).toBe("Jordan Referrer");
  });

  it("persists offer-stage compensation fields", async () => {
    const created = await post("/api/applications", {
      title: "Staff Engineer",
      status: "offer",
      salary_min: 90000,
      salary_max: 90000,
      salary_currency: "EUR",
      salary_period: "year",
      signing_bonus: 5000,
      bonus_target_pct: 10,
      equity_value: 8000,
      benefits_notes: "Unlimited PTO",
    });
    expect(created.status).toBe(201);
    const app = (await created.json()) as {
      id: number;
      signing_bonus: number;
      bonus_target_pct: number;
      equity_value: number;
      benefits_notes: string;
    };
    expect(app.signing_bonus).toBe(5000);
    expect(app.bonus_target_pct).toBe(10);
    expect(app.equity_value).toBe(8000);
    expect(app.benefits_notes).toBe("Unlimited PTO");

    const updated = await authedFetch(`${BASE}/api/applications/${app.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Staff Engineer",
        status: "offer",
        signing_bonus: 6000,
      }),
    });
    expect(updated.status).toBe(200);
    const updatedApp = (await updated.json()) as { signing_bonus: number };
    expect(updatedApp.signing_bonus).toBe(6000);
  });

  it("changes status and records history", async () => {
    const app = await seedApplication();
    const patched = await authedFetch(
      `${BASE}/api/applications/${app.id}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "interview" }),
      },
    );
    expect(patched.status).toBe(200);

    const stats = await authedFetch(`${BASE}/api/stats`);
    const { history: allHistory } = (await stats.json()) as {
      history: {
        application_id: number;
        from_status: string | null;
        to_status: string;
      }[];
    };
    const history = allHistory.filter((h) => h.application_id === app.id);
    expect(history).toEqual([
      expect.objectContaining({ from_status: null, to_status: "interested" }),
      expect.objectContaining({
        from_status: "interested",
        to_status: "interview",
      }),
    ]);
  });

  it("updates just the follow-up (done / snooze) without a status change", async () => {
    const app = await seedApplication({ next_action_at: "2020-01-01" });
    const cleared = (await (
      await authedFetch(`${BASE}/api/applications/${app.id}/follow-up`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_action: null, next_action_at: null }),
      })
    ).json()) as { next_action_at: string | null; status: string };
    expect(cleared.next_action_at).toBeNull();
    expect(cleared.status).toBe("interested"); // status untouched
  });

  it("patches notes and fit_score in place without touching other fields", async () => {
    const app = await seedApplication({ notes: "old", next_action: "Nudge" });
    const patched = (await (
      await authedFetch(`${BASE}/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "new note", fit_score: 4 }),
      })
    ).json()) as { notes: string; fit_score: number; next_action: string };
    expect(patched.notes).toBe("new note");
    expect(patched.fit_score).toBe(4);
    expect(patched.next_action).toBe("Nudge"); // untouched
  });

  it("rejects an out-of-range fit_score patch", async () => {
    const app = await seedApplication({});
    const res = await authedFetch(`${BASE}/api/applications/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fit_score: 9 }),
    });
    expect(res.status).toBe(400);
  });

  it("clears the pending follow-up when status changes", async () => {
    const app = await seedApplication({
      next_action: "Nudge recruiter",
      next_action_at: "2020-01-01",
    });
    const updated = (await (
      await authedFetch(`${BASE}/api/applications/${app.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "screening" }),
      })
    ).json()) as { next_action: string | null; next_action_at: string | null };
    expect(updated.next_action).toBeNull();
    expect(updated.next_action_at).toBeNull();
  });
});

describe("interactions", () => {
  it("logs on an application and on its contact, flagging via_contact", async () => {
    const company = await seedCompany();
    const contactRes = await post("/api/contacts", {
      name: "Jane",
      company_id: company.id,
    });
    const contact = (await contactRes.json()) as { id: number };
    const app = await seedApplication({
      company_id: company.id,
      contact_id: contact.id,
    });

    await post(`/api/applications/${app.id}/interactions`, {
      type: "call",
      notes: "intro call",
    });
    await post(`/api/contacts/${contact.id}/interactions`, {
      type: "message",
      notes: "linkedin ping",
    });

    const timeline = await authedFetch(
      `${BASE}/api/applications/${app.id}/interactions`,
    );
    const items = (await timeline.json()) as {
      type: string;
      via_contact: number;
    }[];
    expect(items.length).toBe(2);
    expect(items.find((i) => i.type === "call")?.via_contact).toBe(0);
    expect(items.find((i) => i.type === "message")?.via_contact).toBe(1);
  });

  it("rejects invalid interaction types", async () => {
    const app = await seedApplication();
    const res = await post(`/api/applications/${app.id}/interactions`, {
      type: "bogus",
    });
    expect(res.status).toBe(400);
  });
});

describe("company research", () => {
  it("requires a website before researching", async () => {
    const company = await seedCompany();
    const res = await authedFetch(`${BASE}/api/companies/${company.id}/research`, {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("404s for an unknown company", async () => {
    const res = await authedFetch(`${BASE}/api/companies/999999/research`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("rejects a non-http website", async () => {
    const created = await post("/api/companies", {
      name: "Bad Scheme Co",
      website: "javascript:alert(1)",
    });
    const company = (await created.json()) as { id: number };
    const res = await authedFetch(
      `${BASE}/api/companies/${company.id}/research`,
      { method: "POST" },
    );
    expect(res.status).toBe(400);
  });
});

describe("documents", () => {
  it("uploads, downloads, deletes", async () => {
    const app = await seedApplication();
    const content = "fake pdf bytes";
    const uploaded = await authedFetch(
      `${BASE}/api/applications/${app.id}/documents?filename=cv.pdf&label=CV%20v3`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(content.length),
        },
        body: content,
      },
    );
    expect(uploaded.status).toBe(201);
    const doc = (await uploaded.json()) as { id: number; label: string };
    expect(doc.label).toBe("CV v3");

    const download = await authedFetch(
      `${BASE}/api/documents/${doc.id}/download`,
    );
    expect(download.status).toBe(200);
    expect(await download.text()).toBe(content);
    expect(download.headers.get("Content-Disposition")).toContain("cv.pdf");

    const del = await authedFetch(`${BASE}/api/documents/${doc.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    const gone = await authedFetch(`${BASE}/api/documents/${doc.id}/download`);
    expect(gone.status).toBe(404);
  });

  it("rejects uploads without a filename", async () => {
    const app = await seedApplication();
    const res = await authedFetch(
      `${BASE}/api/applications/${app.id}/documents`,
      { method: "POST", body: "x" },
    );
    expect(res.status).toBe(400);
  });
});

describe("export", () => {
  it("dumps everything as json", async () => {
    const before = (await (
      await authedFetch(`${BASE}/api/export`)
    ).json()) as { applications: unknown[] };
    await seedCompany();
    await seedApplication();
    const res = await authedFetch(`${BASE}/api/export`);
    expect(res.status).toBe(200);
    const dump = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(dump)).toEqual(
      expect.arrayContaining([
        "exported_at",
        "companies",
        "contacts",
        "applications",
        "interactions",
        "status_history",
        "documents",
      ]),
    );
    expect((dump.applications as unknown[]).length).toBe(
      before.applications.length + 1,
    );
  });

  it("exports csv per table and 404s unknown tables", async () => {
    await seedApplication({ title: 'Engineer, "Platform"' });
    const res = await authedFetch(`${BASE}/api/export/applications.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv.split("\n")[0]).toContain("title");
    expect(csv).toContain('"Engineer, ""Platform"""');

    const bad = await authedFetch(`${BASE}/api/export/sqlite_master.csv`);
    expect(bad.status).toBe(404);
  });
});

describe("feed", () => {
  // Network sources (Adzuna/HN) aren't hit in tests — insert directly at
  // the DB layer, same as a real refresh would, and test the
  // review-inbox endpoints on top of that.
  async function seedFeedItem(overrides: Record<string, unknown> = {}) {
    const row = {
      source: "adzuna",
      external_id: `test-${crypto.randomUUID()}`,
      title: "Platform Engineer",
      company: "Feed Co",
      location: "Remote",
      url: "https://example.com/job",
      salary_text: null,
      role_type: "platform-engineer",
      posted_at: null,
      ...overrides,
    };
    const result = await env.DB.prepare(
      `INSERT INTO feed_items (source, external_id, title, company, location, url, salary_text, role_type, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(
        row.source,
        row.external_id,
        row.title,
        row.company,
        row.location,
        row.url,
        row.salary_text,
        row.role_type,
        row.posted_at,
      )
      .first();
    return result as { id: number };
  }

  it("lists only new items", async () => {
    const item = await seedFeedItem();
    const { items } = (await (
      await authedFetch(`${BASE}/api/feed`)
    ).json()) as { items: { id: number }[] };
    expect(items.some((i) => i.id === item.id)).toBe(true);
  });

  it("paginates with a keyset cursor", async () => {
    // Future posted_at dates guarantee these sort first regardless of
    // whatever else other tests have seeded into the shared pool.
    const a = await seedFeedItem({
      posted_at: "2099-01-02",
      external_id: `pg-a-${crypto.randomUUID()}`,
    });
    const b = await seedFeedItem({
      posted_at: "2099-01-01",
      external_id: `pg-b-${crypto.randomUUID()}`,
    });
    const p1 = (await (
      await authedFetch(`${BASE}/api/feed?limit=1`)
    ).json()) as {
      items: { id: number }[];
      nextCursor: { k: string; id: number } | null;
    };
    expect(p1.items[0].id).toBe(a.id);
    expect(p1.nextCursor).not.toBeNull();
    const cur = p1.nextCursor!;
    const p2 = (await (
      await authedFetch(
        `${BASE}/api/feed?limit=1&cursorK=${encodeURIComponent(cur.k)}&cursorId=${cur.id}`,
      )
    ).json()) as { items: { id: number }[] };
    expect(p2.items.some((i) => i.id === b.id)).toBe(true);
    expect(p2.items.some((i) => i.id === a.id)).toBe(false);
  });

  it("dismiss removes an item from the new list", async () => {
    const item = await seedFeedItem();
    const res = await authedFetch(`${BASE}/api/feed/${item.id}/dismiss`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    const { items } = (await (
      await authedFetch(`${BASE}/api/feed`)
    ).json()) as { items: { id: number }[] };
    expect(items.some((i) => i.id === item.id)).toBe(false);
  });

  it("add creates an application and a new company, then removes from feed", async () => {
    const item = await seedFeedItem({ company: "Brand New Co" });
    const res = await authedFetch(`${BASE}/api/feed/${item.id}/add`, {
      method: "POST",
    });
    expect(res.status).toBe(201);
    const app = (await res.json()) as {
      title: string;
      source: string;
      company_id: number;
    };
    expect(app.title).toBe("Platform Engineer");
    expect(app.source).toBe("feed:adzuna");

    const company = await env.DB.prepare(
      "SELECT name FROM companies WHERE id = ?",
    )
      .bind(app.company_id)
      .first<{ name: string }>();
    expect(company?.name).toBe("Brand New Co");

    const { items } = (await (
      await authedFetch(`${BASE}/api/feed`)
    ).json()) as { items: { id: number }[] };
    expect(items.some((i) => i.id === item.id)).toBe(false);
  });

  it("reuses an existing company by name instead of duplicating it", async () => {
    const existingRes = await post("/api/companies", { name: "Reuse Me" });
    const existing = (await existingRes.json()) as { id: number };
    const item = await seedFeedItem({ company: "reuse me" });
    const res = await authedFetch(`${BASE}/api/feed/${item.id}/add`, {
      method: "POST",
    });
    const app = (await res.json()) as { company_id: number };
    expect(app.company_id).toBe(existing.id);
  });
});

describe("agenda", () => {
  it("combines due dates, interactions, and applied dates", async () => {
    // due/applied have no date window; interactions are limited to the
    // last 14 days (to bound the payload), so use "today" for that one.
    const todayStr = new Date().toISOString().slice(0, 10);
    const app = await seedApplication({
      applied_at: "2026-01-01",
      next_action_at: "2026-01-15",
      next_action: "Nudge recruiter",
    });
    await post(`/api/applications/${app.id}/interactions`, {
      type: "call",
      happened_at: todayStr,
    });

    const res = await authedFetch(`${BASE}/api/agenda`);
    expect(res.status).toBe(200);
    const entries = (await res.json()) as {
      kind: string;
      id: number;
      date: string;
    }[];
    expect(entries.some((e) => e.kind === "due" && e.date === "2026-01-15")).toBe(
      true,
    );
    expect(
      entries.some((e) => e.kind === "applied" && e.date === "2026-01-01"),
    ).toBe(true);
    expect(
      entries.some((e) => e.kind === "interaction" && e.date === todayStr),
    ).toBe(true);
  });

  it("excludes due dates for dead-status applications", async () => {
    const app = await seedApplication({
      next_action_at: "2026-02-01",
      next_action: "Should not appear",
      status: "rejected",
    });
    const res = await authedFetch(`${BASE}/api/agenda`);
    const entries = (await res.json()) as { kind: string; id: number }[];
    expect(
      entries.some((e) => e.kind === "due" && e.id === app.id),
    ).toBe(false);
  });
});

describe("activity", () => {
  it("combines status changes, interactions, and documents across applications", async () => {
    const app = await seedApplication({ title: "Activity Feed Target" });
    await post(`/api/applications/${app.id}/interactions`, {
      type: "call",
      notes: "intro call",
    });
    await authedFetch(`${BASE}/api/applications/${app.id}/documents?filename=cv.pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "Content-Length": "4" },
      body: "%PDF",
    });

    const res = await authedFetch(`${BASE}/api/activity`);
    expect(res.status).toBe(200);
    const events = (await res.json()) as {
      kind: string;
      application_id: number;
      title: string;
      to_status: string | null;
      type: string | null;
      filename: string | null;
    }[];
    const forApp = events.filter((e) => e.application_id === app.id);
    expect(forApp.some((e) => e.kind === "status" && e.to_status === "interested")).toBe(
      true,
    );
    expect(forApp.some((e) => e.kind === "interaction" && e.type === "call")).toBe(true);
    expect(forApp.some((e) => e.kind === "document" && e.filename === "cv.pdf")).toBe(
      true,
    );
    expect(forApp.every((e) => e.title === "Activity Feed Target")).toBe(true);
  });
});

describe("misc", () => {
  it("404s unknown api routes", async () => {
    const res = await authedFetch(`${BASE}/api/nope`);
    expect(res.status).toBe(404);
  });

  it("rejects non-http import urls", async () => {
    const res = await authedFetch(`${BASE}/api/import?url=ftp://example.com`);
    expect(res.status).toBe(400);
  });
});

describe("role types", () => {
  it("lists the seeded defaults", async () => {
    const res = await authedFetch(`${BASE}/api/role-types`);
    const types = (await res.json()) as { slug: string }[];
    expect(types.map((t) => t.slug)).toContain("devops");
    expect(types.length).toBe(5);
  });

  it("creates, renames, deletes, and cascades keyword cleanup", async () => {
    const created = await post("/api/role-types", { label: "QA Engineer" });
    expect(created.status).toBe(201);
    const role = (await created.json()) as { id: number; slug: string };
    expect(role.slug).toBe("qa-engineer");

    await post("/api/feed/config/keywords", {
      role_slug: role.slug,
      keyword: "quality engineer",
    });

    const renamed = await authedFetch(`${BASE}/api/role-types/${role.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "QA / Test Engineer" }),
    });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { label: string }).label).toBe(
      "QA / Test Engineer",
    );

    const deleted = await authedFetch(`${BASE}/api/role-types/${role.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(204);

    const config = await authedFetch(`${BASE}/api/feed/config`);
    const { keywords } = (await config.json()) as {
      keywords: { role_slug: string }[];
    };
    expect(keywords.some((k) => k.role_slug === role.slug)).toBe(false);
  });

  it("rejects a label with no letters or numbers", async () => {
    const res = await post("/api/role-types", { label: "***" });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate slug", async () => {
    const res = await post("/api/role-types", { label: "DevOps" });
    expect(res.status).toBe(409);
  });
});

describe("feed config", () => {
  it("returns seeded sources and keywords", async () => {
    const res = await authedFetch(`${BASE}/api/feed/config`);
    const { sources, keywords } = (await res.json()) as {
      sources: { source: string; enabled: number }[];
      keywords: { role_slug: string; keyword: string }[];
    };
    expect(sources.map((s) => s.source).sort()).toEqual(["adzuna", "hn"]);
    expect(keywords.some((k) => k.role_slug === "devops")).toBe(true);
  });

  it("toggles a source and updates its location", async () => {
    const res = await authedFetch(`${BASE}/api/feed/config/sources/hn`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false, location: "berlin" }),
    });
    expect(res.status).toBe(200);
    const source = (await res.json()) as { enabled: number; location: string };
    expect(source.enabled).toBe(0);
    expect(source.location).toBe("berlin");
  });

  it("rejects toggling an unknown source", async () => {
    // feed_sources rows are now created lazily per user (upsert), so an
    // unknown source name fails the CHECK constraint on insert (400)
    // rather than a plain "row not found" (404).
    const res = await authedFetch(`${BASE}/api/feed/config/sources/bogus`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(400);
  });

  it("adds and deletes a keyword", async () => {
    const created = await post("/api/feed/config/keywords", {
      role_slug: "devops",
      keyword: "Kubernetes Engineer",
    });
    expect(created.status).toBe(201);
    const keyword = (await created.json()) as { id: number; keyword: string };
    expect(keyword.keyword).toBe("kubernetes engineer");

    const deleted = await authedFetch(
      `${BASE}/api/feed/config/keywords/${keyword.id}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(204);
  });

  it("requires role_slug and keyword", async () => {
    const res = await post("/api/feed/config/keywords", { role_slug: "devops" });
    expect(res.status).toBe(400);
  });
});

describe("cv builder", () => {
  it("profile is a singleton that starts empty and can be updated", async () => {
    const initial = await authedFetch(`${BASE}/api/profile`);
    const profile = (await initial.json()) as { id: number; name: string | null };
    expect(profile.id).toBe(1);
    expect(profile.name).toBeNull();

    const updated = await authedFetch(`${BASE}/api/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ronald", email: "ronald@example.com" }),
    });
    expect(updated.status).toBe(200);
    const saved = (await updated.json()) as { name: string; email: string };
    expect(saved.name).toBe("Ronald");
    expect(saved.email).toBe("ronald@example.com");
  });

  it("creates work experience, reuses skills by name, and lists them joined", async () => {
    const created = await post("/api/work-experience", {
      company: "Vandelay Industries",
      title: "Platform Engineer",
      start_month: 3,
      start_year: 2021,
      is_current: true,
    });
    expect(created.status).toBe(201);
    const work = (await created.json()) as { id: number; skills: unknown[] };
    expect(work.skills).toEqual([]);

    const skill1 = await post(`/api/work-experience/${work.id}/skills`, {
      name: "TypeScript",
    });
    expect(skill1.status).toBe(201);
    const s1 = (await skill1.json()) as { id: number; name: string };

    // Re-adding the same name (different case) reuses the existing skill
    const skill2 = await post(`/api/work-experience/${work.id}/skills`, {
      name: "typescript",
    });
    const s2 = (await skill2.json()) as { id: number };
    expect(s2.id).toBe(s1.id);

    const list = await authedFetch(`${BASE}/api/work-experience`);
    const items = (await list.json()) as {
      id: number;
      skills: { id: number; name: string }[];
    }[];
    const found = items.find((w) => w.id === work.id);
    expect(found?.skills.map((s) => s.name)).toEqual(["TypeScript"]);

    const removed = await authedFetch(
      `${BASE}/api/work-experience/${work.id}/skills/${s1.id}`,
      { method: "DELETE" },
    );
    expect(removed.status).toBe(204);
  });

  it("validates required fields for work experience, education, languages", async () => {
    expect((await post("/api/work-experience", {})).status).toBe(400);
    expect((await post("/api/education", {})).status).toBe(400);
    expect((await post("/api/languages", { name: "Dutch" })).status).toBe(400);
  });

  it("creates and deletes education and languages", async () => {
    const edu = await post("/api/education", {
      institution: "TU Delft",
      degree: "MSc",
      field: "Computer Science",
      start_year: 2010,
      end_year: 2014,
    });
    expect(edu.status).toBe(201);
    const eduBody = (await edu.json()) as { id: number };
    const eduDeleted = await authedFetch(
      `${BASE}/api/education/${eduBody.id}`,
      { method: "DELETE" },
    );
    expect(eduDeleted.status).toBe(204);

    const lang = await post("/api/languages", {
      name: "Dutch",
      proficiency: "native",
    });
    expect(lang.status).toBe(201);
    const langBody = (await lang.json()) as { id: number; proficiency: string };
    expect(langBody.proficiency).toBe("native");
    const langDeleted = await authedFetch(
      `${BASE}/api/languages/${langBody.id}`,
      { method: "DELETE" },
    );
    expect(langDeleted.status).toBe(204);
  });
});
