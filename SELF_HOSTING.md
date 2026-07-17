# Self-hosting JobSeekr

JobSeekr runs entirely on Cloudflare's free tier (Workers, D1, R2) for personal use. This walks through standing up your own copy from scratch.

## Prerequisites

- A Cloudflare account
- Node.js 22+
- The [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed via `npm install`, no separate install needed)

## 1. Clone and install

```bash
git clone https://github.com/ronaldlokers/JobSeekr.git
cd JobSeekr
npm install
npx wrangler login
```

## 2. Create your own D1 database

```bash
npx wrangler d1 create jobseekr
```

This prints a `database_id`. Open `wrangler.jsonc` and replace the existing `database_id` under `d1_databases` with your own — the one in the repo belongs to the upstream deployment, not yours.

## 3. Create the R2 bucket

Used for CV/cover-letter file attachments and the daily backup cron.

```bash
npx wrangler r2 bucket create jobseekr-documents
```

If you pick a different bucket name, update `bucket_name` under `r2_buckets` in `wrangler.jsonc` to match.

## 4. Set secrets

Two are required; auth won't start without them.

```bash
npx wrangler secret put BETTER_AUTH_SECRET
# any long random string — e.g. `openssl rand -base64 32`

npx wrangler secret put BETTER_AUTH_URL
# the exact URL you'll access the app at, e.g. https://jobseekr.<your-subdomain>.workers.dev
```

For local development, put the same values in a `.dev.vars` file at the repo root (gitignored):

```
BETTER_AUTH_SECRET=<same value>
BETTER_AUTH_URL=http://localhost:8787
```

Optional — only needed if you want the Feed tab's Adzuna source to pull live listings (the Hacker News "Who's Hiring" source needs no key):

```bash
npx wrangler secret put ADZUNA_APP_ID
npx wrangler secret put ADZUNA_APP_KEY
```
Get a free key at [developer.adzuna.com](https://developer.adzuna.com/). Without it, the Adzuna source is silently skipped — nothing breaks.

Optional — only needed for browser push notifications. No account/signup, it's just a locally-generated keypair:

```bash
node scripts/generate-vapid-keys.mjs
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
# VAPID_SUBJECT is a contact URI push services can reach you at if they need to, e.g. mailto:you@example.com
```
Without these, the push-notification toggle in Settings tells the user push isn't configured — nothing else breaks.

## 5. Apply migrations and deploy

```bash
npx wrangler d1 migrations apply jobseekr --remote
npm run deploy
```

`npm run deploy` builds the frontend and pushes the Worker + static assets in one step.

## 6. Create your login

Account creation is invite-only by design (no public sign-up form) — a seed admin account exists from the initial migration with no credentials set. Give it one:

```bash
node scripts/seed-admin.mjs you@example.com
npx wrangler d1 execute jobseekr --remote --file scripts/.seed-admin.sql
```

You'll be prompted for a password (hidden input, 8+ characters). Log in with that email/password at your deployed URL. Once in, invite any other accounts you want from Settings — the seed admin has an "Invite user" form there (Better Auth's admin plugin under the hood).

## Local development

```bash
npx wrangler d1 migrations apply jobseekr --local
npm run dev
```

This runs against a local D1 replica — no remote resources touched, no secrets required beyond `.dev.vars` from step 4.

## Keeping up to date

Pull upstream and redeploy — new D1 migrations apply automatically as part of `npx wrangler d1 migrations apply`:

```bash
git pull
npm install
npx wrangler d1 migrations apply jobseekr --remote
npm run deploy
```

## CI/CD (optional)

The repo's `.github/workflows/deploy.yml` auto-deploys on push to `main` and applies migrations first. If you fork the repo and want the same, add these to your fork's repository settings:

- Secret `CLOUDFLARE_API_TOKEN` — a token with Workers Scripts:Edit, D1:Edit, and Workers Routes:Edit permissions
- Variable `CLOUDFLARE_ACCOUNT_ID` — found on any page of the Cloudflare dashboard

Without these, just deploy manually with `npm run deploy` whenever you want to ship a change.
