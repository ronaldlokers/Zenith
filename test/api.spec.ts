import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "http://jobseekr.test";

async function post(path: string, body: unknown) {
  return SELF.fetch(`${BASE}${path}`, {
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

    const list = await SELF.fetch(`${BASE}/api/companies`);
    expect(((await list.json()) as unknown[]).length).toBe(1);

    const updated = await SELF.fetch(`${BASE}/api/companies/${company.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme BV" }),
    });
    expect(((await updated.json()) as { name: string }).name).toBe("Acme BV");

    const del = await SELF.fetch(`${BASE}/api/companies/${company.id}`, {
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
    const list = await SELF.fetch(`${BASE}/api/contacts`);
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

  it("changes status and records history", async () => {
    const app = await seedApplication();
    const patched = await SELF.fetch(
      `${BASE}/api/applications/${app.id}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "interview" }),
      },
    );
    expect(patched.status).toBe(200);

    const stats = await SELF.fetch(`${BASE}/api/stats`);
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

    const timeline = await SELF.fetch(
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

describe("documents", () => {
  it("uploads, downloads, deletes", async () => {
    const app = await seedApplication();
    const content = "fake pdf bytes";
    const uploaded = await SELF.fetch(
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

    const download = await SELF.fetch(
      `${BASE}/api/documents/${doc.id}/download`,
    );
    expect(download.status).toBe(200);
    expect(await download.text()).toBe(content);
    expect(download.headers.get("Content-Disposition")).toContain("cv.pdf");

    const del = await SELF.fetch(`${BASE}/api/documents/${doc.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    const gone = await SELF.fetch(`${BASE}/api/documents/${doc.id}/download`);
    expect(gone.status).toBe(404);
  });

  it("rejects uploads without a filename", async () => {
    const app = await seedApplication();
    const res = await SELF.fetch(
      `${BASE}/api/applications/${app.id}/documents`,
      { method: "POST", body: "x" },
    );
    expect(res.status).toBe(400);
  });
});

describe("misc", () => {
  it("404s unknown api routes", async () => {
    const res = await SELF.fetch(`${BASE}/api/nope`);
    expect(res.status).toBe(404);
  });

  it("rejects non-http import urls", async () => {
    const res = await SELF.fetch(`${BASE}/api/import?url=ftp://example.com`);
    expect(res.status).toBe(400);
  });
});
