# JobSeekr

Personal job-hunt tracker: applications, companies, and recruiter contacts with pipeline status. Mobile-friendly web app.

## Stack

- **Frontend**: React + TypeScript + Vite
- **API**: Hono on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
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

After the first deploy, protect the app with [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/): add a self-hosted application for the Worker's hostname with an email policy so only you can reach it.

## Data model

- `applications` — job leads with `status` pipeline (interested → applied → screening → interview → offer / rejected / withdrawn / ghosted) and `role_type` (devops, platform-engineer, front-end, typescript, other)
- `companies` — employers and recruitment agencies (`is_agency`)
- `contacts` — recruiters / hiring managers, optionally linked to a company

## API

REST under `/api`: `GET/POST /api/{applications,companies,contacts}`, `PUT/DELETE /api/{resource}/:id`, `PATCH /api/applications/:id/status`.
