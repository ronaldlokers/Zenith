# BYO Claude API key — design

**Date:** 2026-07-23
**Status:** approved

## Goal

Let each user store their own **Anthropic API key**, encrypted at rest, so the
AI features (resume tailoring first) call Claude under the user's own key —
the user pays their own inference and their text goes to their own Anthropic
account. Invite-only + privacy-first fit. This PR is the storage enabler; the
tailoring feature is a follow-up PR that reads the decrypted key.

Chosen over Workers AI (weaker prose) and a Zenith-owned key (Zenith pays,
text → Anthropic under our account). A claude.ai Pro/Max subscription can't be
used — third-party API access is API-key only.

## Storage & encryption

- **Master key:** `AI_KEY_ENCRYPTION_KEY` — a base64 32-byte (AES-256) secret
  set via `wrangler secret put` (like the VAPID keys). Optional/graceful: if
  unset, the credential endpoints return 503 and the rest of the app is
  unaffected.
- **At rest:** `ai_credentials` table, one row per user. The API key is
  encrypted with **AES-GCM** (WebCrypto `crypto.subtle`, already used for HMAC
  in `worker/public-api.ts`): random 12-byte IV per write; store base64
  ciphertext + base64 IV + a `hint` (last 4 chars, for display) + created_at.
- **Never returned to the client** — write-only, like the seed-admin password.
  Decrypted only in the Worker at call time (the follow-up feature).

## Validation on save

Before storing, verify the key works: `GET https://api.anthropic.com/v1/models`
with `x-api-key` + `anthropic-version: 2023-06-01`. 200 → valid; 401 → reject
with 400. Cheap (no tokens billed). Fixed host, so `worker/url-guard.ts` (the
SSRF guard for user-supplied URLs) does not apply.

## Endpoints (session-auth `/api/*`)

- `GET /api/ai/credentials` → `{ configured: boolean, hint?: string }`. Never
  the key.
- `PUT /api/ai/credentials` `{ apiKey }` → 503 if the master key is unset; 400
  if the key fails validation; else validate → encrypt → upsert → `{ configured:
  true, hint }`.
- `DELETE /api/ai/credentials` → delete the row, 204.

## Frontend

An **"AI (Claude)"** block in the Account settings section:
- Not configured: a `password`-type input + Save (validates on save; shows an
  error if the key is rejected or the server has no master key).
- Configured: "Connected · `sk-ant…<hint>`" + Remove.
- Disclosure line: using AI features sends your CV and the job description to
  Anthropic under your key.

## Files

- `migrations/0044_ai_credentials.sql`
- `worker/ai.ts` — `encryptSecret` / `decryptSecret` (AES-GCM), `validateAnthropicKey`, `registerAiRoutes`
- `worker/index.ts` — register the routes
- `worker/env.d.ts` — add `AI_KEY_ENCRYPTION_KEY?`
- `src/api.ts` — `getAiCredentials` / `setAiKey` / `deleteAiKey`
- `src/settings/account.tsx` (or index) — the AI block
- `src/locales/en.json` + `nl.json` — strings
- `vitest.config.ts` — inject a test `AI_KEY_ENCRYPTION_KEY`
- `test/ai-credentials.spec.ts` — save (valid, via `fetchMock`) / reject invalid
  / get status / delete / encryption round-trip; assert the key is never echoed
  and the stored ciphertext ≠ plaintext

## Out of scope

- The tailoring feature itself (follow-up PR).
- Multiple providers (Anthropic only; no `provider` column yet — YAGNI).
- Per-request cost display / usage metering.
