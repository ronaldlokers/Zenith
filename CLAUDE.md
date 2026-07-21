# Zenith — working guide

Personal job-hunt tracker. Invite-only, multi-user, ambition is a polished public product. This file is the standing brief for anyone (human or agent) working here: the product decisions, the constraints, and how to ship changes.

## Stack
- **Backend:** Cloudflare Workers + Hono (`worker/`). D1 (SQLite, `migrations/`, applied automatically on deploy). R2 for documents. Better Auth (email/password + admin + twoFactor plugins); `/api/*` behind a session-auth middleware, `/api/admin/*` behind an admin-role check. D1 binding/database name: `zenith`.
- **Frontend:** React 19 + Vite + TypeScript. The whole UI lives in `src/App.tsx` (large; a split is a known TODO). `src/App.css` is one file in documented bands (see its header comment) — new CSS goes in bands 1–3, never after the control-normalization layer. `src/index.css` holds the design tokens.
- **Owned components (`src/components/`):** self-contained TS components ported from the design system (Button first), each with its own `*.css`. Styling uses cascade layers — `src/app-styles.css` declares `@layer reset, app, components` (index.css=reset, App.css=app, component CSS=components). A component's CSS lives entirely in `@layer components` and must **fully describe** the component: it reproduces the App.css recipe it replaces, never depends on it (Storybook loads no App.css). Gotchas that bit repeatedly: layer priority is **per-property, not per-rule**, and **unlayered CSS beats all layered CSS** regardless of specificity. App.css recipes are often **context-dependent** (a raw `button.primary` inherits font/line-height and is compacted by container rules like `.form-actions button`), so a faithful variant must let that cascade through, not hardcode one value. Storybook mirrors the app cascade via `.storybook/preview-styles.css`. Swapping a raw `<button>` for `<Button>` must be **zero-diff**: verify with `scripts/screenshot-baseline.mjs` (OUT_DIR captures) + `compare -metric AE` = 0 against the pre-swap render — eyeballing misses the sub-pixel shifts.
- **i18n:** react-i18next, `src/locales/en.json` + `nl.json`. **Strict key parity** between the two — every key exists in both. More locales are planned, so **externalize all user-facing strings** (no hardcoded copy in components).
- **Public surfaces:** `/shared/:token` (server-rendered aggregate stats, no per-application detail, **no compensation** — never add comp columns to it), `/calendar/:token` (ICS), `/api/v1/*` (read-only Bearer key), outbound webhooks. All server-side fetches of user-supplied URLs go through `worker/url-guard.ts` (SSRF guard).

## Locked product decisions
- **~50 applications per heavy user** — simple load-more where needed, no virtualization.
- **No telemetry / analytics.** Privacy is a feature. Don't add tracking.
- **Responsive parity** — mobile is first-class, not an afterthought.
- **Invite-only, no limits** — no sign-up form; no rate-limits/quotas for now.
- **Stage colour palette is accessibility-locked** — never change the stage hues (interested/applied/screening/interview/offer).
- **Three themes:** Automatic (follows OS), Light, Dark (`data-theme` on the root; auto = no attribute). No other themes.

## Design: follow the mockup
When a change has an approved mockup/artifact, **reproduce it faithfully** — match containers, radius, spacing, per-control size and shape, icons, where colour is spent (muted text vs coloured accents), full-bleed vs inset, and every state shown. **Do not assume the existing implementation already matches** — diff each element against the mockup and change what differs. Icons are line-art SVGs in the app's own style (24×24, `currentColor`, `strokeWidth` 2) — not emoji.

Ask clarifying questions before large design work; prefer `AskUserQuestion` with concrete option previews. Big design/feature proposals ship as a Claude artifact of mockups first, then build the chosen direction.

## Git workflow
- **Never commit to `main`.** Short-lived branches: `fix/<topic>`, `feat/<topic>`, `refactor/<topic>`, `docs/<topic>`, `chore/<topic>`.
- Conventional-commit subjects, lowercase imperative: `fix: …`, `feat: …`.
- Open PRs with `gh`; detailed body. Watch CI (`gh pr checks <n> --watch`), then `gh pr merge <n> --squash --delete-branch`. CI jobs: "checks" + "preview". Deploy on `main` auto-applies D1 migrations.
- Never write secrets in plaintext; flag any found.

## Verify before claiming done
Run and confirm green:
- `npx tsc -b` — note `noUnusedLocals` is on: unused symbols are **errors**, so remove dead code (or it won't compile).
- `npm run build`
- `npm run lint` (oxlint) — must be clean, zero warnings; don't introduce any (exhaustive-deps in particular).
- `npx vitest run --no-file-parallelism` — parallel runs flake locally (CI is authoritative). vitest-pool-workers storage is isolated **per test file**, shared within a file; put destructive whole-account tests in their own spec file.
- en/nl key parity (every key in both locales).

For non-trivial UI, **verify against the live render**, not just the DOM: run the app and screenshot at the real viewport. Local rig: `npm run dev`; local D1 needs `wrangler d1 migrations apply zenith --local` first (and again after restoring any `.wrangler/state` DB snapshot). Snapshot + restore the local DB around any data mutations.

## Editing conventions
- `src/App.tsx` is large — prefer exact-string edits with a pre-checked occurrence count; when deleting a function, match its exact text (not a boundary search, which over-deletes).
- Match the surrounding code's style; keep changes surgical.
- Comments state constraints the code can't show — not narration of the change.
