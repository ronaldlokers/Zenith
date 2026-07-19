# Zenith

**A personal job-hunt tracker that treats your search like a pipeline.**

Zenith keeps every application, company, and recruiter contact in one place —
with a kanban board, follow-up reminders, a sourced-listings inbox, a CV
builder, and stats that tell you where deals stall. It's a fast, mobile-first,
privacy-respecting web app: no analytics, no tracking, invite-only.

> Status: personal project, invite-only (no public sign-up). Runs entirely on
> Cloudflare's free tier. Live at **[zenith.lokilabs.nl](https://zenith.lokilabs.nl)**.

---

## Features

**Pipeline**
- Kanban board across five stages — interested → applied → screening → interview → offer — with drag-to-restage, a stage funnel ring, filters, saved views, and an archive.
- Rich application detail: notes, documents (CV / cover letter), interview-prep checklist, cover-letter drafting, JD keyword matching, and a full activity timeline.

**Dashboard & stats**
- KPI cards, weekly momentum, a "next up" action list, and recent activity at a glance.
- Deeper analytics on demand: conversion funnel, response rate, median time-in-stage, ghost rate, and side-by-side offer comparison (exportable).

**Sourced-listings feed**
- A triage inbox that pulls fresh roles every 6 hours from **Adzuna** and any **Greenhouse / Ashby** company boards you follow, filtered by your role keywords. Swipe to add or dismiss.

**Network & CV**
- Companies (employers and agencies) and contacts (recruiters, hiring managers), cross-linked to applications.
- A CV builder — profile, work experience, education, languages — with multi-language support and PDF export.

**Sharing & integrations**
- **Public stats page** (`/shared/:token`) — aggregate pipeline stats only, never per-application detail or compensation.
- **Calendar feed** (`/calendar/:token`) — subscribe to follow-ups and interviews as ICS.
- **Read-only REST API** (`/api/v1`, Bearer key) and **outbound webhooks** (HMAC-signed `X-Zenith-Signature`) on status changes.
- **Web push** notifications for due follow-ups, stale postings, and new feed matches.

**Accounts**
- Better Auth email/password, two-factor (TOTP), an admin console with invites, JSON/CSV data export, and one-click sample data.

**Everywhere**
- Three themes (Automatic / Light / Dark), full **English + Dutch** localization, and first-class mobile layouts.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + TypeScript + Vite |
| API | Hono on Cloudflare Workers |
| Auth | Better Auth (email/password + admin + 2FA), invite-only |
| Database | Cloudflare D1 (SQLite), migrations auto-applied on deploy |
| File storage | Cloudflare R2 (attachments + daily backups) |
| i18n | react-i18next (`en` / `nl`, strict key parity) |
| Hosting | One Cloudflare Workers deploy serves static assets + the Worker |

All server-side fetches of user-supplied URLs pass through an SSRF guard
(`worker/url-guard.ts`).

---

## Getting started

```bash
npm install
npx wrangler d1 migrations apply zenith --local   # seed the local D1
npm run dev                                        # http://localhost:5173
```

Useful scripts:

```bash
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm test          # vitest
npm run deploy    # build + wrangler deploy
```

Setting up your own instance from scratch (D1/R2 resources, secrets, first
login)? See **[SELF_HOSTING.md](./SELF_HOSTING.md)**.

---

## Project layout

```
src/                 React app — one module per feature area
  App.tsx            shell: routing, data state, toasts, keyboard shortcuts
  dashboard·board·detail·feed·calendar·cv·network·settings·stats-view·chrome
  format·types·icons·ui·hooks·routing   shared helpers, primitives, types
  index.css          design tokens (colors, spacing, themes)
  locales/           en.json · nl.json
worker/              Hono API on Workers
  index.ts           REST routes under /api
  feed.ts            sourced-listings ingestion (Adzuna, Greenhouse, Ashby)
  auth.ts · calendar.ts · public-api.ts · push.ts · url-guard.ts
migrations/          D1 schema (applied automatically on deploy)
```

## Data model

- `applications` — job leads with a `status` pipeline (interested → applied → screening → interview → offer / rejected / withdrawn / ghosted) and `role_type` (devops, platform-engineer, front-end, typescript, other), plus `status_history` for pipeline-timing stats.
- `companies` — employers and recruitment agencies (`is_agency`).
- `contacts` — recruiters / hiring managers, optionally linked to a company.
- `tags` / `application_tags` — free-form labels on applications.
- `interactions` — logged touchpoints (email, call, interview, …) per application or contact.
- `interview_prep_items` — per-application prep checklist.
- `journal_entries` — personal wins / milestones log.
- `feed_items` / `feed_sources` / `feed_role_keywords` / `feed_company_blocklist` — the sourced-listings inbox (Adzuna, plus Greenhouse / Ashby ATS boards).
- `profile`, `work_experience`, `education`, `languages` — CV-builder data.
- Better Auth's own `user` / `session` / `account` tables handle login.

## API

REST under `/api`, defined in `worker/index.ts` (plus `worker/feed.ts` for the
sourcing inbox). The public, key-authenticated surface lives in
`worker/public-api.ts` (`/api/v1`). See those files for the authoritative route
list rather than a summary that drifts out of date.

---

## Principles

- **Privacy is a feature** — no analytics, no telemetry, no third-party trackers.
- **Mobile is first-class**, not an afterthought.
- **Accessibility-locked stage palette** — the five pipeline hues never change.
- **The public share page never exposes compensation** or per-application detail.
