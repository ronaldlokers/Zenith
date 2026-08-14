import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Contacts and companies had only created_at, so the optimistic concurrency
// applications already had could not be extended to them: there was no
// version to compare. Their forms seed from the record loaded when the page
// opened and their PUT routes write every column, which is the exact pair
// that reverts a field the form never showed.
//
// The case this is for: the outreach composer marks someone contacted from a
// phone, and a contact form open on a laptop since breakfast is then saved.
const BASE = "http://zenith.test";
const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;

/** updated_at is datetime('now'); a write inside the same second is a tie. */
const pastTheSecond = () => new Promise((r) => setTimeout(r, 1100));

async function makeContact() {
  return json(
    await authedFetch(`${BASE}/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sam Okafor", notes: "intro call done" }),
    }),
  );
}

describe("a contact form saved from a stale copy", () => {
  it("is refused rather than reverting what changed", async () => {
    const made = await makeContact();
    const id = made.id as number;
    expect(made.updated_at, "new contacts carry a version").toBeTruthy();

    await pastTheSecond();
    // The outreach composer, elsewhere.
    await authedFetch(`${BASE}/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        last_contacted_at: "2026-08-14",
        outreach_status: "awaiting_reply",
      }),
    });

    const stale = await authedFetch(`${BASE}/api/contacts/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": made.updated_at as string,
      },
      body: JSON.stringify({ ...made, phone: "+31 6 1234 5678" }),
    });
    expect(stale.status, "a stale contact form save was accepted").toBe(412);

    const list = (await json(
      await authedFetch(`${BASE}/api/contacts`),
    )) as unknown as Record<string, unknown>[];
    const after = list.find((r) => r.id === id)!;
    expect(after.outreach_status).toBe("awaiting_reply");
    expect(after.last_contacted_at).toBe("2026-08-14");
  });

  it("goes through when nothing moved underneath it", async () => {
    // The other direction: the precondition must not block the ordinary save,
    // which is the whole point of the form.
    const made = await makeContact();
    const id = made.id as number;
    const ok = await authedFetch(`${BASE}/api/contacts/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": made.updated_at as string,
      },
      body: JSON.stringify({ ...made, phone: "+31 6 1234 5678" }),
    });
    expect(ok.status).toBe(200);
    expect((await json(ok)).phone).toBe("+31 6 1234 5678");
  });

  it("still saves for a caller that sends no version", async () => {
    // Additive by design: the API, the extension and anything else that never
    // learned about If-Match must keep working.
    const made = await makeContact();
    const res = await authedFetch(`${BASE}/api/contacts/${made.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...made, role: "Head of Platform" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("a company form saved from a stale copy", () => {
  it("is refused rather than reverting what changed", async () => {
    const made = await json(
      await authedFetch(`${BASE}/api/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Northwind", notes: "great team" }),
      }),
    );
    const id = made.id as number;
    expect(made.updated_at, "new companies carry a version").toBeTruthy();

    await pastTheSecond();
    await authedFetch(`${BASE}/api/companies/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...made, notes: "hiring freeze until Q1" }),
    });

    const stale = await authedFetch(`${BASE}/api/companies/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": made.updated_at as string,
      },
      body: JSON.stringify({ ...made, website: "https://northwind.example" }),
    });
    expect(stale.status, "a stale company form save was accepted").toBe(412);

    const list = (await json(
      await authedFetch(`${BASE}/api/companies`),
    )) as unknown as Record<string, unknown>[];
    expect(list.find((r) => r.id === id)!.notes).toBe("hiring freeze until Q1");
  });
});
