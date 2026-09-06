import type { Context, Hono } from "hono";
import { PIPELINE, computePipelineMomentum } from "../src/momentum.js";
import type { Status } from "../src/types.js";
import type { AppEnv } from "./index.js";

// The public share page, lifted out of worker/index.ts (#100). It was ~380
// lines of server-rendered HTML, its own five-language-adjacent string table,
// its own locale negotiation and its own escaping, sitting in the middle of
// the router — while worker/goals.ts is 45 lines and worker/documents.ts is
// 21. The split tracked when a feature was written rather than what it is.
//
// It earns a module more than most of what already has one: it is the only
// surface that answers without a session, it renders HTML rather than JSON,
// and none of it is reachable from any other route.
//
// Behaviour is unchanged. The move is proven by test/share-page.spec.ts and
// test/share-momentum.spec.ts, which drive the rendered page through the
// Worker and were written before this refactor.

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SHARE_STRINGS = {
  en: {
    title: "Shared pipeline",
    momentumLabel: "Pipeline momentum",
    steady: "Steady",
    quiet: "No recent activity",
    faster: "Speeding up",
    early: "Too early to tell",
    slower: "Slowing down",
    open: (n: number) => `${n} open application${n === 1 ? "" : "s"}`,
    footer:
      "Read-only view — no application details, no editing. Powered by Zenith.",
    sharedOn: "Shared",
    ogDescription:
      "A read-only summary of a job search: how many applications are open and how far they have progressed. No per-application detail.",
    stages: {
      interested: "Interested",
      applied: "Applied",
      screening: "Screening",
      interview: "Interview",
      offer: "Offer",
    } as Record<string, string>,
  },
  nl: {
    title: "Gedeelde pijplijn",
    momentumLabel: "Voortgang",
    steady: "Stabiel",
    quiet: "Geen recente activiteit",
    faster: "Versnelt",
    early: "Nog te vroeg",
    slower: "Vertraagt",
    open: (n: number) =>
      `${n} openstaande sollicitatie${n === 1 ? "" : "s"}`,
    footer:
      "Alleen-lezen weergave — geen details per sollicitatie, geen bewerking. Mogelijk gemaakt door Zenith.",
    sharedOn: "Gedeeld",
    ogDescription:
      "Een alleen-lezen samenvatting van een zoektocht naar werk: hoeveel sollicitaties lopen en hoe ver ze zijn. Geen details per sollicitatie.",
    stages: {
      interested: "Geïnteresseerd",
      applied: "Gesolliciteerd",
      screening: "Screening",
      interview: "Gesprek",
      offer: "Aanbod",
    } as Record<string, string>,
  },
} as const;

type ShareLocale = keyof typeof SHARE_STRINGS;

// Entry-page negotiation, which is what Accept-Language is for. Quality
// values are honoured so "en;q=0.8, nl;q=0.9" picks Dutch; anything we do
// not speak falls through to the sharer's own stored locale, then English.
function shareLocale(header: string | undefined, ownerLocale: string | null): ShareLocale {
  const ranked = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.tag && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    if (tag === "*") break;
    const base = tag.split("-")[0];
    if (base === "nl" || base === "en") return base;
  }
  return ownerLocale === "nl" ? "nl" : "en";
}

// A revoked or mistyped share link. Settings' regenerate control
// invalidates the previous link, so this is a routine outcome rather than an
// edge case — and its most likely reader is the stranger the link was sent
// to, who concludes the sender is careless or the product is broken. Still a
// 404, and still identical for "revoked" and "never existed" so the response
// leaks nothing; only the rendering changes.
function sharePageGone(c: Context<AppEnv>) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return c.html(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Link not active — Zenith</title>
<style nonce="${nonce}">
  :root { color-scheme: dark }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #14173a; color: #e7e6f0; padding: 2rem;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 26rem; text-align: center }
  /* Real ramp steps, inlined as literals and named — the same discipline
     the shared-pipeline page above uses, so a drift is obvious on sight:
       1.375rem --text-heading    0.64rem --text-chrome
     The first draft of this page used 1.25rem, which is on the ramp but as
     --text-figure-md, a step for numbers rather than headings, and 0.72rem,
     which is not on it at all. */
  h1 { font-size: 1.375rem; margin: 0 0 0.5rem; font-weight: 600 }
  p { margin: 0; color: #b9b8cc; line-height: 1.5 }
  .mark {
    font-size: 0.64rem; letter-spacing: 0.14em; text-transform: uppercase;
    color: #8b8fa8; margin-bottom: 1.25rem;
  }
</style>
</head>
<body>
<main>
  <p class="mark">Zenith</p>
  <h1>This link is no longer active</h1>
  <p>Ask the person who shared it for a new one.</p>
</main>
</body>
</html>`,
    404,
    { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" },
  );
}

export function registerShareRoutes(app: Hono<AppEnv>) {
  app.get("/shared/:token", async (c) => {
  const token = c.req.param("token");
  const profile = await c.env.DB.prepare(
    // The owner's locale is the fallback when the reader's browser asks for
    // a language this page does not speak.
    `SELECT profile.user_id, profile.name, profile.share_show_identity,
            "user".locale AS locale
     FROM profile LEFT JOIN "user" ON "user".id = profile.user_id
     WHERE profile.share_token = ?`,
  )
    .bind(token)
    .first<{
      user_id: string;
      name: string | null;
      share_show_identity: number;
      locale: string | null;
    }>();
  if (!profile) return sharePageGone(c);

  const [apps, history] = await Promise.all([
    c.env.DB.prepare(
      // Only what the page prints. applied_at and created_at were fetched
      // and never rendered — a public route should select nothing it does
      // not show.
      // role_type comes back only to name the track being searched, and only
      // when identity is on. It is a stage-agnostic label the user already
      // maintains per application — no new field to keep up to date, and
      // nothing per-application reaches the page.
      "SELECT id, status, role_type FROM applications WHERE user_id = ?",
    )
      .bind(profile.user_id)
      .all<{ id: number; status: string; role_type: string | null }>(),
    c.env.DB.prepare(
      // Deliberately without outcome_reason/outcome_note (#381), unlike the
      // in-app stats query: the note is free text the user wrote about a
      // company, and this page is aggregate-only for anyone with the link.
      `SELECT application_id, from_status, to_status, changed_at
       FROM status_history WHERE user_id = ? ORDER BY application_id, changed_at, id`,
    )
      .bind(profile.user_id)
      .all<{
        application_id: number;
        from_status: string | null;
        to_status: string;
        changed_at: string;
      }>(),
  ]);

  const reachedByApp = new Map<number, number>();
  for (const row of history.results) {
    const idx = PIPELINE.indexOf(row.to_status as Status);
    if (idx < 0) continue;
    const prev = reachedByApp.get(row.application_id) ?? -1;
    if (idx > prev) reachedByApp.set(row.application_id, idx);
  }
  const funnel = PIPELINE.map((stage, i) => ({
    stage,
    count: [...reachedByApp.values()].filter((r) => r >= i).length,
  }));
  const funnelMax = Math.max(1, funnel[0]?.count ?? 0);

  const lang = shareLocale(c.req.header("Accept-Language"), profile.locale);
  const S = SHARE_STRINGS[lang];

  // Off unless the owner turned it on. The page is aggregate-only by design
  // and a name on a public URL is the owner's call, so the default stays
  // anonymous and Settings carries the switch.
  const showIdentity = profile.share_show_identity === 1 && !!profile.name;
  const liveRoles = apps.results.filter(
    (a) => !["rejected", "withdrawn", "ghosted"].includes(a.status),
  );
  const topRole = (() => {
    if (!showIdentity) return null;
    const counts = new Map<string, number>();
    for (const a of liveRoles) {
      if (!a.role_type || a.role_type === "other") continue;
      counts.set(a.role_type, (counts.get(a.role_type) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [role, n] of counts) if (n > bestN) [best, bestN] = [role, n];
    return best;
  })();
  const roleLabel = topRole
    ? topRole.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
    : null;
  const shownOn = new Date().toISOString().slice(0, 10);
  const pageTitle = showIdentity
    ? `${profile.name} — ${S.title}`
    : `Zenith — ${S.title}`;

  // The same verdict the app shows its owner, from the same function — the
  // page used to reimplement the ratio and had never picked up the small-n
  // floor, so one stage advance told a stranger the search was speeding up.
  const { verdict } = computePipelineMomentum(history.results);
  const momentum = {
    none: S.quiet,
    early: S.early,
    up: S.faster,
    down: S.slower,
    flat: S.steady,
  }[verdict];

  const totalOpen = apps.results.filter(
    (a) => !["rejected", "withdrawn", "ghosted"].includes(a.status),
  ).length;

  const rows = funnel
    .map(
      // The width is a class rather than a style attribute so this page can
      // carry a Content-Security-Policy with no unsafe-inline in it at all
      // (see the nonce below). It is the only unauthenticated surface here.
      (f, i) => `
      <div class="row">
        <span class="lbl">${S.stages[f.stage] ?? f.stage}</span>
        <span class="track"><span class="fill fill-${i}"></span></span>
        <span class="n">${f.count}</span>
      </div>`,
    )
    .join("");

  // One nonce per response, so the policy below can name this exact style
  // block without opening the page to any other inline content.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const barWidths = funnel
    .map((f, i) => `.fill-${i}{width:${(f.count / funnelMax) * 100}%}`)
    .join("");

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(pageTitle)}</title>
<meta property="og:title" content="${escapeHtml(pageTitle)}" />
<meta property="og:description" content="${escapeHtml(S.ogDescription)}" />
<meta property="og:type" content="website" />
<style nonce="${nonce}">
${barWidths}
  /* This page is the only Zenith surface someone who is not a user ever sees,
     so it carries the brand rather than a generic dark theme (#528). It is a
     standalone document with no access to src/index.css, so the tokens are
     inlined as literals — but they are the REAL token values, named here so a
     drift is obvious on sight:
       #14173a --night          #1b1f4d --night-raised
       #e7e6f0 --rail-ink       #b9b8cc --rail-muted     #8b8fa8 --rail-faint
       #d6a441 --accent (Struck Brass)
     The rail tones are the ones already contrast-validated against the Night
     ground, which is why they are reused here rather than picked by eye.
     Sizes are the DESIGN.md ramp: 0.95 title, 1.375 heading, 0.875 body,
     0.75 meta, 0.64 chrome. */
  body { font-family: system-ui, -apple-system, sans-serif; background: #14173a; color: #e7e6f0; margin: 0; padding: 2rem 1.25rem; }
  .wrap { max-width: 32rem; margin: 0 auto; }
  /* .when always follows and carries the gap to the momentum card, so the
     heading's own bottom margin would double it. */
  h1 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.15rem; }
  /* No border: on the Night ground the raised fill is the lift, and DESIGN.md
     puts state in the fill rather than on a coloured edge. */
  .momentum { padding: 0.9rem 1rem; margin-bottom: 1.5rem; border-radius: 10px; background: #1b1f4d; }
  .momentum-label { display:block; font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.06em; color: #b9b8cc; }
  /* The one focal statement on the page — the Single Hero Rule's tier-3. */
  .momentum-value { font-size: 1.375rem; font-weight: 700; }
  .open-count { color: #b9b8cc; font-size: 0.875rem; margin-bottom: 1.5rem; display: block; }
  .row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; font-size: 0.875rem; }
  /* min-width, not width, and no capitalize: the labels are translated
     strings now rather than DB slugs, and "Geïnteresseerd" is wider than
     the 5.5rem the English set fitted in — measured, it clipped at both
     1440 and 390. The column still aligns for every label that fits. */
  .lbl { min-width: 5.5rem; flex-shrink: 0; color: #b9b8cc; }
  /* Whose search this is, and when it was shared. Both are the difference
     between a page a stranger can act on and an anonymous chart. Real ramp
     steps, named, like everything else here: 0.64rem --text-chrome. */
  .eyebrow {
    margin: 0 0 0.15rem; font-size: 0.64rem; letter-spacing: 0.14em;
    text-transform: uppercase; color: #d6a441;
  }
  .when {
    margin: 0.15rem 0 1.25rem; font-size: 0.64rem; letter-spacing: 0.06em;
    color: #8b8fa8;
  }
  .track { flex: 1; height: 8px; background: #1b1f4d; border-radius: 999px; overflow: hidden; }
  /* Struck Brass, not the teal this page used to invent. Brass is the one
     accent Zenith spends on the figure that carries the eye. */
  .fill { display: block; height: 100%; background: #d6a441; }
  .n { width: 1.5rem; text-align: right; }
  footer { margin-top: 2rem; font-size: 0.75rem; color: #8b8fa8; }
</style>
</head>
<body>
  <!-- <main>, not a div. The revoked-link page above already uses one, so
       this was the only one of the two public pages without a main landmark:
       axe reports landmark-one-main, and "jump to main content" finds nothing
       to jump to on the one page strangers actually see. -->
  <main class="wrap">
    ${
      // With a name on it the person is the subject and the page title is the
      // label; without one there is no subject, so the label is all there is.
      // Swapping which of the two is the h1 keeps the anonymous page exactly
      // as it was and stops the named page burying whose search it is.
      showIdentity
        ? `<p class="eyebrow">${S.title}</p>
    <h1>${escapeHtml(profile.name ?? "")}</h1>
    <p class="when">${
      roleLabel ? `${escapeHtml(roleLabel)} · ` : ""
    }${S.sharedOn} ${shownOn}</p>`
        : `<h1>${S.title}</h1>
    <p class="when">${S.sharedOn} ${shownOn}</p>`
    }
    <div class="momentum">
      <span class="momentum-label">${S.momentumLabel}</span>
      <span class="momentum-value">${momentum}</span>
    </div>
    <span class="open-count">${S.open(totalOpen)}</span>
    ${rows}
    <footer>${S.footer}</footer>
  </main>
</body>
</html>`;

  // The strictest policy this page can carry, which is very strict: it has no
  // scripts at all, loads nothing from anywhere, and its one style block is
  // named by nonce. Nothing here is unsafe-inline.
  //
  // Only this route. The app itself is a React bundle whose policy needs
  // working out against a deployment; this page is server-rendered HTML whose
  // every byte is known here, so it can have the policy today rather than
  // waiting for that.
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  return c.html(html, 200, {
    // The URL contains the token, so no shared cache may hold this and no
    // outbound request may carry it in a Referer. /calendar/:token already
    // sets a private cache policy; this route set nothing at all and left
    // it to whatever a proxy decided. There are no links on the page today,
    // which is exactly when the referrer policy is free to add.
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    // Announce what was negotiated, which is the other half of the contract.
    "Content-Language": lang,
  });
});
}
