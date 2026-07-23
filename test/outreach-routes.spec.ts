import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

const BASE = "http://zenith.test";
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("outreach templates CRUD", () => {
  it("creates, lists, updates and deletes a template", async () => {
    let res = await authedFetch(
      `${BASE}/api/outreach-templates`,
      json({ name: "Follow-up", body: "Hi {{first_name}}" }),
    );
    expect(res.status).toBe(201);
    const created = await res.json<{ id: number; name: string; body: string }>();
    expect(created.name).toBe("Follow-up");
    expect(created.body).toBe("Hi {{first_name}}");

    res = await authedFetch(`${BASE}/api/outreach-templates`);
    const list = await res.json<{ id: number }[]>();
    expect(list.some((t) => t.id === created.id)).toBe(true);

    res = await authedFetch(`${BASE}/api/outreach-templates/${created.id}`, {
      ...json({ name: "Renamed", body: "Hey {{name}}" }),
      method: "PUT",
    });
    expect(res.status).toBe(200);
    expect((await res.json<{ name: string }>()).name).toBe("Renamed");

    res = await authedFetch(`${BASE}/api/outreach-templates/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("rejects a template with no name or body", async () => {
    const res = await authedFetch(
      `${BASE}/api/outreach-templates`,
      json({ name: "", body: "" }),
    );
    expect(res.status).toBe(400);
  });
});
