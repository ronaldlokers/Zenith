import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Two saves, both 200, one edit gone. Reproduced before the fix: tab A adds
// a note, tab B — which loaded before that save — writes its stale copy of
// every column back and the note is silently null again. Neither request
// failed and nobody was told.
//
// The realistic pair is not two forms open at once. It is a note typed
// inline on a phone and then the full form saved on a laptop that has been
// open since breakfast.
const BASE = "http://zenith.test";

// Seeded with an updated_at in the past, which is what a stale client
// actually holds: a form opened an hour ago carries an hour-old value.
// Relying on the timestamp advancing naturally does not work — updated_at is
// datetime('now') at second resolution, so a seed and the write after it
// land in the same second and the "stale" value still matches.
async function seed(title: string) {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, status: "applied" }),
  });
  const app = await res.json<Record<string, unknown>>();
  const stale = "2026-01-01 09:00:00";
  await env.DB.prepare("UPDATE applications SET updated_at = ? WHERE id = ?")
    .bind(stale, app.id)
    .run();
  return { ...app, updated_at: stale };
}

const put = (id: unknown, body: unknown, ifMatch?: string) =>
  authedFetch(`${BASE}/api/applications/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(ifMatch ? { "If-Match": ifMatch } : {}),
    },
    body: JSON.stringify(body),
  });

const read = async (id: unknown) => {
  const list = await (await authedFetch(`${BASE}/api/applications`)).json<
    Record<string, unknown>[]
  >();
  return list.find((r) => r.id === id);
};

describe("concurrent edits", () => {
  it("refuses a write built on a row that has moved on", async () => {
    const app = await seed("Stale write");
    const a = await put(app.id, { ...app, notes: "Recruiter called Tuesday" });
    expect(a.status).toBe(200);

    // Tab B still holds the version it loaded before A saved.
    const b = await put(app.id, { ...app, salary_min: 90000 }, String(app.updated_at));
    expect(b.status, "a stale write must not succeed").toBe(412);

    const row = await read(app.id);
    expect(row?.notes, "the earlier edit survived").toBe("Recruiter called Tuesday");
    expect(row?.salary_min, "the rejected write applied nothing").toBeNull();
  });

  it("tells the client what the current version is", async () => {
    // So it can reload rather than ask the user to work out what happened.
    const app = await seed("Conflict body");
    await put(app.id, { ...app, notes: "first" });
    const stale = await put(app.id, { ...app, notes: "second" }, String(app.updated_at));
    const body = await stale.json<{ error: string; current_updated_at: string }>();
    expect(body.error).toMatch(/changed somewhere else/i);
    expect(body.current_updated_at).toBeTruthy();
    expect(body.current_updated_at).not.toBe(app.updated_at);
  });

  it("accepts a write that carries the current version", async () => {
    const app = await seed("Fresh write");
    const res = await put(app.id, { ...app, notes: "ok" }, String(app.updated_at));
    expect(res.status).toBe(200);
  });

  it("still accepts a write with no precondition at all", async () => {
    // Additive: the cover-letter panel and the browser extension send no
    // If-Match, and must keep working exactly as before.
    const app = await seed("No precondition");
    await put(app.id, { ...app, notes: "one" });
    const res = await put(app.id, { ...app, notes: "two" });
    expect(res.status).toBe(200);
    expect((await read(app.id))?.notes).toBe("two");
  });
});
