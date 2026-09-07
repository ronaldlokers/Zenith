import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// The compensation fields were bound straight from the request body. Nothing
// — no CHECK constraint, no route validation — stopped a negative salary or a
// 500% bonus target going in, and totalComp() computes bonus as
// base * bonus_target_pct / 100 unconditionally. The nonsense then comes back
// out through the offer comparison, the PDF export and the negotiation draft,
// which are the three places the numbers are supposed to be trustworthy.
//
// The guard belongs on the server rather than in the form: the form is not the
// only writer. The browser extension posts applications, and PUT rewrites
// every column from the body.
//
// fit_score is here for the same reason, not as scope creep — it is the other
// unbounded number on this table, and a fit_score of 9 draws nine stars.
const BASE = "http://zenith.test";

const create = (body: Record<string, unknown>) =>
  authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Bounds fixture", ...body }),
  });

async function rejected(body: Record<string, unknown>, why: string) {
  const res = await create(body);
  expect(res.status, why).toBe(400);
  return (await res.json<{ error: string }>()).error;
}

describe("compensation the server will not store", () => {
  it("refuses a negative salary", async () => {
    expect(await rejected({ salary_min: -1 }, "a negative salary was stored")).toMatch(
      /salary/i,
    );
    await rejected({ salary_max: -50000 }, "a negative maximum was stored");
  });

  it("refuses a maximum below the minimum", async () => {
    await rejected(
      { salary_min: 90000, salary_max: 60000 },
      "a range that runs backwards was stored",
    );
  });

  it("refuses a bonus target that is not a percentage", async () => {
    // The one from the report: 500 becomes a bonus five times base, printed
    // into a PDF someone takes to a salary conversation.
    await rejected({ bonus_target_pct: 500 }, "a 500% bonus target was stored");
    await rejected({ bonus_target_pct: -10 }, "a negative bonus target was stored");
  });

  it("refuses a negative one-off payment", async () => {
    await rejected({ signing_bonus: -1000 }, "a negative signing bonus was stored");
    await rejected({ equity_value: -1 }, "negative equity was stored");
  });

  it("refuses a number that is not a number", async () => {
    // The API is public enough to be posted to by hand and by the extension.
    // SQLite would happily keep the string and every reader downstream would
    // do arithmetic on it.
    await rejected({ salary_min: "lots" }, "a text salary was stored");
    // JSON cannot carry Infinity — but a string that coerces to it can, and
    // "1e999" is what a number field posted as text looks like.
    await rejected({ salary_max: "1e999" }, "an infinite salary was stored");
  });

  it("refuses a fit score outside the five stars that render it", async () => {
    await rejected({ fit_score: 9 }, "a nine-star fit score was stored");
    await rejected({ fit_score: 0 }, "a zero-star fit score was stored");
    await rejected({ fit_score: 999 }, "a wildly out-of-range fit score was stored");
    await rejected({ fit_score: -50 }, "a negative fit score was stored");
  });

  it("refuses a fit score that isn't a whole star", async () => {
    // sortCards's fit sort and matchBand both assume a whole 1-5 rating.
    expect(await rejected({ fit_score: 2.5 }, "a fractional fit score was stored")).toMatch(
      /fit_score/i,
    );
  });
});

describe("compensation the server still stores", () => {
  it("keeps a full, ordinary offer intact", async () => {
    const res = await create({
      salary_currency: "EUR",
      salary_min: 85000,
      salary_max: 95000,
      salary_period: "year",
      signing_bonus: 5000,
      bonus_target_pct: 15,
      equity_value: 20000,
      fit_score: 4,
    });
    expect(res.status, "a valid offer was rejected").toBe(201);
    const row = await res.json<Record<string, number>>();
    expect(row.salary_min).toBe(85000);
    expect(row.bonus_target_pct).toBe(15);
  });

  it("allows the edges of each range", async () => {
    // Zero is a real answer — an unpaid internship, no bonus scheme, no
    // equity. So is a flat single figure, where min and max are equal.
    const res = await create({
      salary_min: 0,
      salary_max: 0,
      signing_bonus: 0,
      bonus_target_pct: 0,
      equity_value: 0,
      fit_score: 5,
    });
    expect(res.status, "zero was treated as invalid").toBe(201);
    const flat = await create({ salary_min: 70000, salary_max: 70000 });
    expect(flat.status, "a single figure was treated as a backwards range").toBe(201);
  });

  it("accepts one end of a range without the other", async () => {
    // The near-miss this guard shipped with once: Number(null) is 0, so
    // reading the pair unconditionally made every row with a minimum and no
    // maximum look like a range that runs backwards. test/concurrent-edit
    // caught it, which is the only reason it is not in production.
    expect((await create({ salary_min: 90000 })).status).toBe(201);
    expect((await create({ salary_max: 90000 })).status).toBe(201);
  });

  it("leaves an application with no compensation on it alone", async () => {
    const res = await create({});
    expect(res.status).toBe(201);
  });
});

describe("the same bounds on the way in through PUT", () => {
  it("rejects what POST rejects, since PUT rewrites every column", async () => {
    const created = await create({ salary_min: 50000 });
    const { id } = await created.json<{ id: number }>();

    const bad = await authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bounds fixture", bonus_target_pct: 900 }),
    });
    expect(bad.status, "PUT is a second way in and had no guard").toBe(400);

    const still = await authedFetch(`${BASE}/api/applications`);
    const rows = await still.json<{ id: number; salary_min: number }[]>();
    expect(
      rows.find((r) => r.id === id)?.salary_min,
      "the rejected write changed the row anyway",
    ).toBe(50000);
  });

  const putFitScore = async (id: number, fit_score: unknown) =>
    authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bounds fixture", fit_score }),
    });

  it("rejects an out-of-range or fractional fit_score on PUT", async () => {
    const created = await create({});
    const { id } = await created.json<{ id: number }>();

    for (const bad of [999, -50, 2.5]) {
      const res = await putFitScore(id, bad);
      expect(res.status, `fit_score ${bad} was stored via PUT`).toBe(400);
      const { error } = await res.json<{ error: string }>();
      expect(error).toMatch(/fit_score/i);
    }
  });

  it("accepts the boundaries, and absent or null, on PUT", async () => {
    const created = await create({});
    const { id } = await created.json<{ id: number }>();

    for (const good of [1, 5]) {
      const res = await putFitScore(id, good);
      expect(res.status, `fit_score ${good} was rejected via PUT`).toBe(200);
      const row = await res.json<{ fit_score: number }>();
      expect(row.fit_score).toBe(good);
    }

    const withNull = await authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bounds fixture", fit_score: null }),
    });
    expect(withNull.status, "an explicit null fit_score was rejected via PUT").toBe(200);

    const withoutField = await authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bounds fixture" }),
    });
    expect(withoutField.status, "an absent fit_score was rejected via PUT").toBe(200);
  });
});

describe("the same bounds on the way in through PATCH", () => {
  const patchFitScore = async (id: number, fit_score: unknown) =>
    authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fit_score }),
    });

  it("rejects an out-of-range or fractional fit_score on PATCH", async () => {
    const created = await create({});
    const { id } = await created.json<{ id: number }>();

    for (const bad of [999, -50, 0, 2.5]) {
      const res = await patchFitScore(id, bad);
      expect(res.status, `fit_score ${bad} was stored via PATCH`).toBe(400);
      const { error } = await res.json<{ error: string }>();
      expect(error).toMatch(/fit_score/i);
    }
  });

  it("accepts the boundaries, and absent or null, on PATCH", async () => {
    const created = await create({});
    const { id } = await created.json<{ id: number }>();

    for (const good of [1, 5]) {
      const res = await patchFitScore(id, good);
      expect(res.status, `fit_score ${good} was rejected via PATCH`).toBe(200);
      const row = await res.json<{ fit_score: number }>();
      expect(row.fit_score).toBe(good);
    }

    const withNull = await authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fit_score: null }),
    });
    expect(withNull.status, "an explicit null fit_score was rejected via PATCH").toBe(200);

    // Not touching fit_score at all in the body is legal too — PATCH only
    // validates fields it was actually asked to write.
    const notesOnly = await authedFetch(`${BASE}/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "unrelated edit" }),
    });
    expect(notesOnly.status, "an unrelated PATCH was rejected").toBe(200);
  });
});
