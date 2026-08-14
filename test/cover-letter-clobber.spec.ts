import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// The cover-letter panel saved with PUT /api/applications/:id and a spread of
// the whole application object it was holding: { ...application, cover_letter }.
// That route writes every column, so the save puts back stale copies of every
// field the panel never showed.
//
// The optimistic-concurrency work made that route refuse a stale write when
// the caller sends If-Match, and deliberately left existing callers alone on
// the grounds that "the narrower panels write one field they have just read".
// This panel does not — it writes all of them, from a snapshot taken when the
// detail page loaded.
const BASE = "http://zenith.test";

const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;

async function seed(): Promise<Record<string, unknown>> {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Staff Engineer", role_type: "other" }),
  });
  return json(res);
}

describe("saving a cover letter from a page loaded earlier", () => {
  it("leaves the fields it never showed alone", async () => {
    const app = await seed();
    const id = app.id as number;

    // What the detail page is holding. Everything below happens after this.
    const snapshot = { ...app };

    // The same account, somewhere else: a note typed on a phone, or the
    // detail page's own inline patch.
    const patched = await json(
      await authedFetch(`${BASE}/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "rang the recruiter back", fit_score: 5 }),
      }),
    );
    expect(patched.notes).toBe("rang the recruiter back");

    // Now the cover-letter panel saves. It sends only what it owns — the
    // snapshot is deliberately still in scope, unused, because sending it is
    // the whole defect.
    void snapshot;
    const saved = await authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cover_letter: "Dear hiring team," }),
    });
    expect(saved.status).toBe(200);

    // There is no GET for one application — the app reads the list.
    const list = (await json(
      await authedFetch(`${BASE}/api/applications`),
    )) as unknown as Record<string, unknown>[];
    const after = list.find((r) => r.id === id)!;
    expect(after.cover_letter).toBe("Dear hiring team,");
    expect(
      after.notes,
      "the note is gone — the cover-letter save put back the snapshot's copy",
    ).toBe("rang the recruiter back");
    expect(after.fit_score, "the fit score went with it").toBe(5);
  });

  it("refuses a whole-object save that arrives stale", async () => {
    // The other half. PUT still writes every column, and the panel is no
    // longer its caller — but the route is public API and the next caller to
    // spread an object into it should be refused rather than silently
    // reverting fields. If-Match is what does that.
    const app = await seed();
    const id = app.id as number;
    const snapshot = { ...app };

    // updated_at is datetime('now') — second resolution. Without this wait
    // the create and the patch share a timestamp, the validator matches, and
    // the stale save is accepted: the route's own comment calls that out as a
    // deliberate remaining sliver, since the conflict it targets is a form
    // left open for minutes. Waiting past the second is what makes this a
    // test of the precondition rather than of the clock.
    await new Promise((r) => setTimeout(r, 1100));
    await authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "typed on the train" }),
    });

    const stale = await authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": snapshot.updated_at as string,
      },
      body: JSON.stringify({ ...snapshot, cover_letter: "Dear hiring team," }),
    });
    expect(stale.status, "a stale whole-object save was accepted").toBe(412);

    const list = (await json(
      await authedFetch(`${BASE}/api/applications`),
    )) as unknown as Record<string, unknown>[];
    expect(list.find((r) => r.id === id)!.notes).toBe("typed on the train");
  });
});
