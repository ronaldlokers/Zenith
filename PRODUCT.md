# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: mid/senior technology job-seekers (engineering, DevOps, platform, front-end) running a **serious, active search** — a weeks-to-months push of roughly 50 applications, with daily check-ins, follow-ups and interviews stacking up on top of a job or a runway. They arrive under time pressure and want to know what to do next, not to admire a dashboard.

Invite-only is the **current stage, not the audience**. The product is designed for a first-time user who has never met the author: nothing may rely on private context, insider naming, or the author's own data shape.

Secondary: the author, as the daily heavy user and the source of every requirement so far. Administrators (invite management, user admin) are the same people, not a separate persona.

## Product Purpose

Zenith runs a job hunt as a pipeline. It holds every application, company and recruiter contact in one place, sources fresh listings into a triage inbox, and reports where the search stalls — response rate, median time-in-stage, ghost rate, conversion funnel, offer comparison.

Success is a user who, on opening the app, knows the next action within seconds and never loses a follow-up. Secondary success: at the end of a search, the user can explain *why* it went the way it did from their own data.

## Positioning

Three claims a neighboring tracker could not truthfully copy:

1. **Pipeline rigor, sales-CRM grade.** Stages, `status_history`, time-in-stage, ghost rate, conversion funnel and side-by-side offer comparison. Zenith diagnoses where the search is failing; a list-of-applications tracker only records what was sent.
2. **Sourcing and pipeline are one loop.** The feed (Adzuna plus any Greenhouse / Ashby board the user follows, filtered by their own role keywords) is part of the system, not an external site the user pastes from. Swipe a listing into the pipeline; the application carries its origin.
3. **Personal-tool craft at product polish.** Mobile-first parity (not a shrunk desktop), keyboard-fast, three themes, full en/nl, fast on a free-tier Worker. The category norm is heavy, slow and monetized against the user.

Privacy (no analytics, no telemetry, no trackers, self-hostable, exportable, BYO AI key) is a **standing constraint and a principle**, not the headline claim — it must never be traded away, and it is not the reason someone chooses Zenith.

## Operating Context

- **Daily loop:** open → see what is due today → triage new feed matches → log a touchpoint → advance a stage. Mobile and desktop both real; mobile often used between other commitments, one-handed.
- **Weekly loop:** review momentum and stalled applications, chase follow-ups, prep for interviews.
- **Materials in play:** job descriptions, CVs and cover letters (R2 documents), an in-app CV builder with PDF export and versions, JD keyword matching, ATS scoring, interview-prep checklists, outreach templates.
- **Off-app surfaces:** the ICS calendar feed lands interviews and follow-ups in the user's own calendar; web push carries due follow-ups, stale postings and new matches; a public `/shared/:token` stats page and a read-only `/api/v1` key expose aggregates outward; outbound webhooks fire on status changes; a browser extension autofills from the pipeline.
- **Scale:** ~50 applications for a heavy user. Never a big-data problem; no virtualization, load-more where needed.

## Capabilities and Constraints

Confirmed capabilities: kanban pipeline over five stages (interested → applied → screening → interview → offer, plus rejected / withdrawn / ghosted) with drag-to-restage, filters, saved views and archive; application detail with notes, documents, timeline, prep, tailoring; sourced-listings feed; companies and contacts; CV builder with versions and PDF; insights (funnel, response rate, time-in-stage, ghost rate, offer comparison, calendar); goals; AI resume tailoring on a user-supplied Claude key; email/password auth with TOTP 2FA; admin console with invites; JSON/CSV export; sample data.

Durable constraints:

- **No telemetry or analytics, ever.** No third-party trackers.
- **Invite-only, no public sign-up.** No rate limits or quotas for now.
- **The five stage hues are locked by measured separation**, not by specific values: every pair stays distinguishable under normal vision and all three dichromacies, and every stage stays readable as label text. Enforced in CI.
- **The public share page carries aggregate stats only** — never per-application detail, never compensation.
- **Exactly three themes:** Automatic (follows OS), Light, Dark. No others.
- **Strict en/nl key parity**; more locales planned, so every user-facing string is externalized.
- **Responsive parity** — mobile is first-class, not a fallback.
- Server-side fetches of user-supplied URLs pass an SSRF guard.
- Runs on Cloudflare's free tier (Workers + D1 + R2); that budget is a real design constraint.

Terminology: *pipeline* (not "job list"), *stage* (not "column"), *feed* for sourced listings, *touchpoint/interaction* for logged contact, *application* for a tracked role.

Undecided: whether invite-only ever opens to public sign-up, and on what terms. Pricing, licensing and any commercial model — **none decided, none may be implied**.

## Brand Commitments

- Name: **Zenith**. Deployed at zenith.lokilabs.nl.
- Icons are line-art SVGs in the app's own style — 24×24, `currentColor`, `strokeWidth` 2. **Never emoji.**
- Design tokens live in `src/index.css`; `src/App.css` is one banded file; owned components in `src/components/` are self-contained under `@layer components` and must fully describe themselves.
- `--serif` is Geist, not a literal serif.
- Voice: plain, direct, no hype, no growth-marketing tone. Copy states what happened and what to do.

## Evidence on Hand

- Working, deployed product with real daily use by the author: this repository, live at zenith.lokilabs.nl.
- Screenshot baselines in `baseline/` and `scripts/screenshot-baseline.mjs`; Storybook (`.storybook/`) with the a11y addon.
- A sample-data generator (`worker/demo.ts`) — realistic but **synthetic**; never present it as user data.
- Documentation: `README.md`, `SELF_HOSTING.md`, `CLAUDE.md`.

Absent, and not to be fabricated: testimonials, named customers, user counts, reviews, press, case studies, benchmark numbers, uptime figures, pricing, and any claim of a team behind the product.

## Product Principles

1. **Next action over dashboard.** Every surface answers "what do I do now?" before it answers "how am I doing?"
2. **Pipeline truth.** Stage, timing and outcome data is the product's spine; features that don't feed or read it are suspect.
3. **Privacy is structural.** No tracking, user-owned data, self-hostable. Not negotiable, not a selling point to shout.
4. **Mobile is a first-class surface**, designed for the situation it's used in — brief, one-handed, between other things.
5. **Personal-tool speed, product-grade craft.** Fast, keyboard-reachable, precise in detail; polish is the differentiator, not decoration.

## Accessibility & Inclusion

- The five stage hues are contrast-validated and locked; colour is never the sole carrier of stage meaning.
- Storybook runs the a11y addon; keyboard shortcuts exist across the shell.
- Full English and Dutch, with more locales planned — no hardcoded user-facing copy.
- No formal conformance target (e.g. WCAG 2.2 AA) has been committed. **Undecided.**
