import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

const BASE = "http://zenith.test";
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("CV versions", () => {
  it("saves, lists and deletes a version, preserving the snapshot", async () => {
    const snapshot = JSON.stringify({ profile: { name: "Ada" }, workExperience: [] });
    let res = await authedFetch(
      `${BASE}/api/cv-versions`,
      post({ name: "Backend-focused", snapshot }),
    );
    expect(res.status).toBe(201);
    const created = await res.json<{ id: number; name: string; snapshot: string }>();
    expect(created.name).toBe("Backend-focused");
    expect(created.snapshot).toBe(snapshot);

    res = await authedFetch(`${BASE}/api/cv-versions`);
    const list = await res.json<{ id: number }[]>();
    expect(list.some((v) => v.id === created.id)).toBe(true);

    res = await authedFetch(`${BASE}/api/cv-versions/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("rejects a version with no name", async () => {
    const res = await authedFetch(`${BASE}/api/cv-versions`, post({ name: "" }));
    expect(res.status).toBe(400);
  });
});
