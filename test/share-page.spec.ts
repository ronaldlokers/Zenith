import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// The public share page is the only Zenith surface someone who is not a user
// ever sees, and it carries a standing rule: aggregate stats only, no
// per-application detail, and never compensation. That rule was structural
// rather than enforced — the route's SELECT simply does not take those
// columns — so nothing would object to a well-meant "show the offer figure
// here" beyond a reviewer noticing.
//
// A note for whoever verifies this by hand: in the Vite dev server a browser
// navigation to /shared/:token is intercepted by the SPA middleware and
// renders the login screen instead. `curl` gets the real page. It is a dev
// artifact — in production the Worker owns the route — but it makes a manual
// check say whatever you were afraid of, in either direction. This spec runs
// against the Worker, which is the thing that actually serves it.
const BASE = "http://zenith.test";
const TOKEN = "share-page-spec-token";

async function seedShared() {
  await authedFetch(`${BASE}/api/profile/share-token`, { method: "POST" });
  await env.DB.prepare("UPDATE profile SET share_token = ? WHERE user_id = ?")
    .bind(TOKEN, "seed-admin")
    .run();
}

// Values chosen to be unmistakable if any of them ever reaches the markup.
const SECRETS = {
  title: "Staff Platform Engineer at Northwind",
  company: "Northwind Cloud Systems",
  currency: "GBP",
  min: 123456,
  max: 234567,
  bonus: 34567,
  equity: 45678,
  notes: "they said the team is in trouble",
};

// Returns the open-application count the page reports, so a test can prove
// its fixture actually reached the page rather than passing vacuously.
async function openCount(html: string): Promise<number> {
  const m = html.match(/open-count">(\d+)/);
  expect(m, "page did not report an open count").toBeTruthy();
  return Number(m![1]);
}

async function seedApplication() {
  const company = await authedFetch(`${BASE}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: SECRETS.company }),
  });
  const { id: companyId } = await company.json<{ id: number }>();
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: SECRETS.title,
      company_id: companyId,
      status: "offer",
      salary_currency: SECRETS.currency,
      salary_min: SECRETS.min,
      salary_max: SECRETS.max,
      signing_bonus: SECRETS.bonus,
      equity_value: SECRETS.equity,
      notes: SECRETS.notes,
    }),
  });
  expect(res.status).toBeLessThan(300);
}

describe("public share page", () => {
  it("renders for a valid token and 404s for anything else", async () => {
    await seedShared();
    const ok = await SELF.fetch(`${BASE}/shared/${TOKEN}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("shared pipeline");

    const bad = await SELF.fetch(`${BASE}/shared/not-a-real-token`);
    expect(bad.status).toBe(404);
  });

  it("never puts compensation on the page", async () => {
    await seedShared();
    const before = await openCount(
      await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text(),
    );
    await seedApplication();
    const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
    // Prove the fixture is on the page before asserting what is not: an
    // application that never landed would pass every check below.
    expect(await openCount(html)).toBe(before + 1);

    for (const value of [
      SECRETS.currency,
      String(SECRETS.min),
      String(SECRETS.max),
      String(SECRETS.bonus),
      String(SECRETS.equity),
    ]) {
      expect(html, `compensation leaked: ${value}`).not.toContain(value);
    }
    // The words too, not only the figures — a "salary range" label with the
    // numbers stripped would still be a comp column.
    for (const word of ["salary", "Salary", "compensation", "Compensation"]) {
      expect(html, `compensation wording leaked: ${word}`).not.toContain(word);
    }
  });

  it("never puts per-application detail on the page", async () => {
    await seedShared();
    await seedApplication();
    const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
    expect(html).not.toContain(SECRETS.title);
    expect(html).not.toContain(SECRETS.company);
    expect(html).not.toContain(SECRETS.notes);
  });

  it("stops answering once the token is revoked", async () => {
    await seedShared();
    expect((await SELF.fetch(`${BASE}/shared/${TOKEN}`)).status).toBe(200);
    await authedFetch(`${BASE}/api/profile/share-token`, { method: "DELETE" });
    expect((await SELF.fetch(`${BASE}/shared/${TOKEN}`)).status).toBe(404);
  });
});
