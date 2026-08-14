import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

const BASE = "http://zenith.test";
const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;

// The outreach composer keeps a contact on screen while the message is
// written, so its copy is old by construction — and "mark contacted" sent
// { ...contact, last_contacted_at, outreach_status } through PUT, which
// writes every column. Measured before the fix: a note added elsewhere
// reverted to what the panel had loaded, and the mark reported as saved.
describe("marking a contact contacted from a panel loaded earlier", () => {
  it("leaves the fields it never showed alone", async () => {
    const made = await json(
      await authedFetch(`${BASE}/api/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alex Rivera", notes: "met at meetup" }),
      }),
    );
    const id = made.id as number;
    const snapshot = { ...made };

    // Somewhere else: the contact's own form, or another device.
    await authedFetch(`${BASE}/api/contacts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...made, notes: "referred me to the hiring lead" }),
    });

    // "Mark contacted" writes the two fields it owns and nothing else. The
    // snapshot stays in scope unused on purpose — sending it is the defect.
    void snapshot;
    const marked = await authedFetch(`${BASE}/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        last_contacted_at: "2026-08-14",
        outreach_status: "awaiting_reply",
      }),
    });
    expect(marked.status).toBe(200);

    const list = (await json(
      await authedFetch(`${BASE}/api/contacts`),
    )) as unknown as Record<string, unknown>[];
    const after = list.find((r) => r.id === id)!;
    expect(
      after.notes,
      "the note is gone — marking contacted put back the panel's copy",
    ).toBe("referred me to the hiring lead");
    expect(after.last_contacted_at).toBe("2026-08-14");
    expect(after.outreach_status).toBe("awaiting_reply");
  });
});

// The CV tailor holds work experience across an AI call that takes tens of
// seconds, then applied a rewritten description with { ...item, description }.
// Same route shape, same result.
describe("applying a tailored description", () => {
  it("leaves the rest of the entry alone", async () => {
    const made = (await authedFetch(`${BASE}/api/work-experience`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "Northwind",
        title: "Engineer",
        description: "old text",
      }),
    }).then((r) => r.json())) as Record<string, unknown>;
    const id = made.id as number;

    await authedFetch(`${BASE}/api/work-experience/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...made, title: "Senior Engineer" }),
    });

    const applied = await authedFetch(`${BASE}/api/work-experience/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "tailored text" }),
    });
    expect(applied.status).toBe(200);

    const list = (await authedFetch(`${BASE}/api/work-experience`).then((r) =>
      r.json(),
    )) as Record<string, unknown>[];
    const after = list.find((r) => r.id === id)!;
    expect(after.description).toBe("tailored text");
    expect(
      after.title,
      "the title reverted — the tailor put back what the CV page had loaded",
    ).toBe("Senior Engineer");
  });
});
