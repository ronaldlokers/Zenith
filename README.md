# JobSeekr

Personal job-hunt tracker: applications, companies, and recruiter contacts with pipeline status. Mobile-friendly web app.

## Stack

- **Frontend**: React + TypeScript + Vite
- **API**: Hono on Cloudflare Workers
- **Auth**: Better Auth (email/password, invite-only — no public sign-up)
- **Database**: Cloudflare D1 (SQLite)
- **File storage**: Cloudflare R2 (CV/cover-letter attachments, daily backups)
- **Hosting**: Cloudflare Workers (static assets + Worker in one deploy)

## Development

```bash
npm install
npx wrangler d1 migrations apply jobseekr --local
npm run dev
```

## Deploy

```bash
npx wrangler d1 migrations apply jobseekr --remote
npm run deploy
```

Setting up your own instance from scratch (D1/R2 resources, secrets, first login)? See [SELF_HOSTING.md](./SELF_HOSTING.md).

## Data model

- `applications` — job leads with `status` pipeline (interested → applied → screening → interview → offer / rejected / withdrawn / ghosted) and `role_type` (devops, platform-engineer, front-end, typescript, other), plus `status_history` for pipeline timing stats
- `companies` — employers and recruitment agencies (`is_agency`)
- `contacts` — recruiters / hiring managers, optionally linked to a company
- `tags` / `application_tags` — free-form labels on applications
- `interactions` — logged touchpoints (email, call, interview, …) per application or contact
- `interview_prep_items` — per-application prep checklist
- `journal_entries` — personal wins/milestones log
- `feed_items` / `feed_sources` / `feed_role_keywords` / `feed_company_blocklist` — the sourced-listings inbox (Adzuna, Hacker News "Who's Hiring")
- `profile`, `work_experience`, `education`, `languages` — CV builder data
- Better Auth's own `user` / `session` / `account` tables handle login

## API

REST under `/api`, defined in `worker/index.ts` (plus `worker/feed.ts` for the sourcing inbox) — see those files for the full route list rather than a summary that'll drift out of date.
