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
// renders the login screen instead. `curl` gets the real page. This spec runs
// against the Worker, which is the thing that actually serves it.
//
// That it is only a dev artifact is now measured rather than assumed. Against
// a preview deployment, with a browser's own Accept header:
//
//   /shared/<unknown token>  404, empty body   — the Worker answering
//   /board                   200, SPA shell    — the assets fallback
//   /nope-not-a-route        200, SPA shell
//
// The 404 is the route rejecting a token it does not know, not the SPA
// shell being served in its place, which is what the dev server does.
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
    expect(await ok.text()).toContain("Shared pipeline");

    const bad = await SELF.fetch(`${BASE}/shared/not-a-real-token`);
    expect(bad.status).toBe(404);
  });

  it("speaks the reader's language, not the developer's", async () => {
    // The page is server-rendered outside React, so it cannot reach
    // react-i18next and was hard-coded English — on a product with strict
    // en/nl parity, on the one page most likely to be opened by someone who
    // never chose a language.
    await seedShared();
    const dutch = await SELF.fetch(`${BASE}/shared/${TOKEN}`, {
      headers: { "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" },
    });
    expect(dutch.headers.get("content-language")).toBe("nl");
    const nl = await dutch.text();
    expect(nl).toContain('<html lang="nl">');
    expect(nl).toContain("Gedeelde pijplijn");
    expect(nl, "stage labels are translated, not capitalised slugs").toContain(
      "Geïnteresseerd",
    );

    // Quality values decide, so a lower-ranked English does not win.
    const byQuality = await SELF.fetch(`${BASE}/shared/${TOKEN}`, {
      headers: { "Accept-Language": "en;q=0.8, nl;q=0.9" },
    });
    expect(byQuality.headers.get("content-language")).toBe("nl");

    // A language the page does not speak falls through to English.
    const german = await SELF.fetch(`${BASE}/shared/${TOKEN}`, {
      headers: { "Accept-Language": "de-DE,de;q=0.9" },
    });
    expect(german.headers.get("content-language")).toBe("en");
    expect(await german.text()).toContain("Shared pipeline");
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

  it("carries a policy with nothing unsafe in it", async () => {
    // This is the only surface someone who is not a user ever reaches, and
    // it is server-rendered HTML whose every byte is known — so it can have
    // a real Content-Security-Policy today, rather than waiting for the
    // React bundle's to be worked out against a deployment.
    await seedShared();
    const res = await SELF.fetch(`${BASE}/shared/${TOKEN}`);
    const csp = res.headers.get("content-security-policy");
    expect(csp, "the share page has no policy").toBeTruthy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp, "a nonce beats unsafe-inline; the page needs neither").not.toContain(
      "unsafe-inline",
    );

    const html = await res.text();
    const nonce = csp!.match(/'nonce-([a-f0-9]+)'/)?.[1];
    expect(nonce, "no nonce in the policy").toBeTruthy();
    expect(html, "the style block is not the one the policy names").toContain(
      `<style nonce="${nonce}">`,
    );
  });

  it("keeps every style off the elements themselves", async () => {
    // A style attribute cannot run under this policy, so adding one back
    // would not error — the rule would simply not apply, and a funnel bar
    // would quietly render at full width. The bar widths are classes in the
    // nonced block for exactly this reason.
    await seedShared();
    await seedApplication();
    const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
    expect(html).not.toMatch(/ style="/);
    expect(html, "the widths should be emitted as classes").toMatch(
      /\.fill-\d+\{width:/,
    );
  });

  describe("identity", () => {
    // The page can say whose search it is, but only if the owner opted in.
    // Two things are worth pinning: that the default really is off (a
    // migration default is easy to get backwards, and getting it backwards
    // publishes a name nobody agreed to publish), and that the name is
    // escaped — it is the only user-authored string on a public page.
    it("says nothing about who by default", async () => {
      await seedShared();
      await env.DB.prepare(
        "UPDATE profile SET name = ?, share_show_identity = 0 WHERE user_id = ?",
      )
        .bind("Jordan Ellis", "seed-admin")
        .run();
      const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
      expect(html).not.toContain("Jordan Ellis");
      expect(html).toMatch(/<title>Zenith — /);
    });

    it("names the owner once opted in, in the heading and the unfurl", async () => {
      await seedShared();
      await env.DB.prepare(
        "UPDATE profile SET name = ?, share_show_identity = 1 WHERE user_id = ?",
      )
        .bind("Jordan Ellis", "seed-admin")
        .run();
      const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
      expect(html).toContain("<h1>Jordan Ellis</h1>");
      expect(html).toMatch(/<title>Jordan Ellis — /);
      expect(html).toMatch(
        /<meta property="og:title" content="Jordan Ellis — /,
      );
    });

    it("escapes the name rather than trusting it", async () => {
      // The CSP would stop an injected script running; markup injection into
      // the document is not something to leave to a second line of defence.
      await seedShared();
      await env.DB.prepare(
        "UPDATE profile SET name = ?, share_show_identity = 1 WHERE user_id = ?",
      )
        .bind('Jo "><img src=x onerror=alert(1)>', "seed-admin")
        .run();
      const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
      expect(html, "the payload was emitted as markup").not.toContain("<img");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      // The title attribute sink is a separate escape from the text sink.
      expect(html).toMatch(/content="Jo &quot;&gt;&lt;img /);
    });

    it("stays silent when opted in with no name set", async () => {
      // A blank heading is worse than the anonymous page it replaced.
      await seedShared();
      await env.DB.prepare(
        "UPDATE profile SET name = NULL, share_show_identity = 1 WHERE user_id = ?",
      )
        .bind("seed-admin")
        .run();
      const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
      expect(html).toMatch(/<h1>Shared pipeline<\/h1>/);
      expect(html).not.toContain('class="eyebrow"');
    });

    it("refuses a non-boolean on the opt-in route", async () => {
      const res = await authedFetch(`${BASE}/api/profile/share-identity`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show: "yes" }),
      });
      expect(res.status).toBe(400);
    });

    it("round-trips the opt-in", async () => {
      const on = await authedFetch(`${BASE}/api/profile/share-identity`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show: true }),
      });
      expect(on.status).toBe(200);
      const row = await env.DB.prepare(
        "SELECT share_show_identity AS v FROM profile WHERE user_id = ?",
      )
        .bind("seed-admin")
        .first<{ v: number }>();
      expect(row?.v).toBe(1);

      await authedFetch(`${BASE}/api/profile/share-identity`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show: false }),
      });
      const off = await env.DB.prepare(
        "SELECT share_show_identity AS v FROM profile WHERE user_id = ?",
      )
        .bind("seed-admin")
        .first<{ v: number }>();
      expect(off?.v).toBe(0);
    });
  });

  it("gives each response its own nonce", async () => {
    // A fixed nonce is the same as no nonce: anyone who has seen one page
    // knows the value that unlocks the next.
    await seedShared();
    const [a, b] = await Promise.all([
      SELF.fetch(`${BASE}/shared/${TOKEN}`),
      SELF.fetch(`${BASE}/shared/${TOKEN}`),
    ]);
    const nonceOf = (r: Response) =>
      r.headers.get("content-security-policy")?.match(/'nonce-([a-f0-9]+)'/)?.[1];
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });

  // Both public pages are documents in their own right, not fragments of the
  // app, so each needs a main landmark — "jump to main content" is how a
  // screen reader user skips the chrome, and on the share page it had nothing
  // to jump to. The revoked-link page already had one, which is what made the
  // gap easy to miss: whichever of the two you looked at first, it was fine.
  it("wraps both public pages in a main landmark", async () => {
    await seedShared();
    const live = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
    expect(live).toMatch(/<main[\s>]/);
    expect(live).toMatch(/<\/main>/);

    const revoked = await (
      await SELF.fetch(`${BASE}/shared/definitely-not-a-token`)
    ).text();
    expect(revoked).toMatch(/<main[\s>]/);
  });
});

// Every user-authored string that reaches this page, not only the one the
// code comment names.
//
// The comment above escapeHtml says the display name "is the only
// user-authored string that reaches this page", and the test above covers
// exactly that string. It is not the only one: the role label shown beside it
// is derived from an application's role_type, and role_type is bound straight
// from the request body with no check that it matches a role type that
// exists. So it is arbitrary text from the account holder, and the escape on
// it is load-bearing rather than belt-and-braces.
//
// Nothing was broken — it is escaped. It was untested, which is the state a
// refactor removes an escape from without anything going red.
describe("every user-authored string on the public page", () => {
  const PAYLOAD = '"><img src=x onerror=alert(1)>';

  it("escapes the role label, which is not a slug once it reaches here", async () => {
    await seedShared();
    // A name too: the identity block is gated on one being set, and the role
    // label lives inside it. Without this the assertion passes against a page
    // that renders no role at all.
    await env.DB.prepare(
      "UPDATE profile SET name = ?, share_show_identity = 1 WHERE user_id = ?",
    )
      .bind("Jo Rivera", "seed-admin")
      .run();
    // Two of them, so the role is the top one and actually rendered.
    for (let i = 0; i < 2; i++) {
      await env.DB.prepare(
        `INSERT INTO applications (user_id, title, role_type, status)
         VALUES (?, ?, ?, 'applied')`,
      )
        .bind("seed-admin", `Role ${i}`, PAYLOAD)
        .run();
    }

    const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
    // The label title-cases the slug before rendering, so the payload comes
    // through as "<Img Src=x ...". A case-sensitive check for "<img" would
    // pass while a real injection sat on the page — which is what the first
    // version of this test did.
    expect(html, "the payload was emitted as markup").not.toMatch(/<img/i);
    // Title-casing capitalises after every word boundary, so the payload
    // arrives as "<Img Src=X Onerror=Alert(1)>" — asserted as rendered rather
    // than as typed, because the transform is part of what reaches the page.
    expect(html).toContain("&lt;Img Src=X Onerror=Alert(1)&gt;");
  });

  it("leaves no unescaped angle bracket from any seeded field", async () => {
    // The rule rather than the two fields known today: seed the payload into
    // every user-authored string that can reach the page and assert none of
    // it survives as markup. A third sink added later is covered by this
    // without anyone remembering to extend it.
    await seedShared();
    await env.DB.prepare(
      "UPDATE profile SET name = ?, share_show_identity = 1 WHERE user_id = ?",
    )
      .bind(PAYLOAD, "seed-admin")
      .run();
    for (let i = 0; i < 2; i++) {
      await env.DB.prepare(
        `INSERT INTO applications (user_id, title, role_type, status)
         VALUES (?, ?, ?, 'applied')`,
      )
        .bind("seed-admin", PAYLOAD, PAYLOAD)
        .run();
    }

    const html = await (await SELF.fetch(`${BASE}/shared/${TOKEN}`)).text();
    // The payload's own markup, in any form that would parse as a tag.
    // Case-insensitive, because two of these sinks transform the string on
    // the way through. Not asserting on "onerror=alert" as a substring: the
    // correctly escaped output contains it as text, so that assertion fails
    // on a page that is doing exactly the right thing.
    expect(html, "the payload was emitted as markup").not.toMatch(/<img/i);
    expect(html, "the payload never reached the page").toMatch(/&lt;[Ii]mg/);
  });
});
