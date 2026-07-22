---
name: zero-diff-verify
description: Use to prove a refactor is pixel-identical — any change that SHOULD be visually zero-diff (extracting a component, moving CSS, renaming classes, swapping markup). Captures the current tree vs the git-stashed pre-change tree in the same session and diffs with ImageMagick compare -metric AE. Load whenever you need to confirm "this looks exactly the same".
---

Prove a change causes **no visual difference**. The gate is `compare -metric AE = 0` (ImageMagick; available in this env). AE = count of differing pixels — 0 means byte-identical render. This is the authoritative check for any refactor claimed to be zero-diff; eyeballing misses sub-pixel shifts (a ~1px layer-priority flip reads as AE≈2500, invisible by eye).

## The rig (one-time, already set up)

- Local D1 must be migrated: `wrangler d1 migrations apply zenith --local`.
- A saved auth session at `.auth.json` (gitignored) — `scripts/screenshot-baseline.mjs` fails closed without it (refuses to baseline a login page). The seed-admin (`dev@zenith.test`) password was reset to a throwaway local value so login can be driven programmatically; snapshot `.wrangler/state` before touching the DB.
- `baseline/`, `after*/`, `control/` are gitignored (regenerated).

## The loop

1. **Start the dev server** and wait for `:5173`:
   `npm run dev &` then poll `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173` until `200`.
2. **Capture "after"** (current working tree) with Playwright — see `capture.mjs` in this skill dir. Key rules:
   - `storageState: ".auth.json"`, viewport(s) desktop 1440×900 **and** mobile 390×844 (mobile parity is locked — check both when the change has responsive rules).
   - `await page.evaluate(() => document.fonts.ready)` **before every screenshot** — a cold dev server FOUTs (fallback font) and every view then diffs. Then a short `waitForTimeout(120)`.
   - `fullPage: true, animations: "disabled"`. `waitUntil: "domcontentloaded"` + a settle timeout beats `networkidle` (which flakes/times out).
3. **Capture "control"** (pre-change) IN THE SAME SESSION: `git stash push <only the files your change touched>` → recapture into a `control/` dir → `git stash pop`. **Stash the swap, do NOT diff against an older `baseline/`** — the baseline carries date/data drift and cold-FOUT noise; same-session after-vs-control isolates *your* change.
   - Stash ONLY the changed source files — if you stash `index.ts` but leave other files importing the new component, control won't compile. Match the stash set to the change.
4. **Diff** each view: `compare -metric AE control/x.png after/x.png null:` → expect `0`.
5. **On non-zero:** `compare control/x.png after/x.png -highlight-color red diff.png`, then **Read `diff.png`** and find what moved (this is judgment — do it on the main model). Common cause: a layer-priority flip (a property that was inert in App.css became active in `@layer components`) — inline only the effective value. Also compare `identify -format '%wx%h'` — a height delta means an element resized and shifted everything below.

## Triggering hidden UI

Many components only render on interaction or specific data:
- **Modals / dropdowns / palettes:** click to open (`.bcard-body` opens the detail modal; `.cmdk` opens the command palette; the bell opens notifications), then screenshot.
- **Empty states:** force with a no-match search (`fill("zzzzqqq")`), or note the account is data-complete.
- **Truly unreachable in the seed** (e.g. data-complete onboarding): can't pixel-diff — fall back to **gate + mechanical identity** (the change is a pure move / byte-identical CSS reproduction, verified by tsc/build/tests). Say so explicitly; don't claim AE=0 you didn't run.

## Cleanup

Kill the dev server by PID (avoid `pkill -f vite` — it also matches the vitest workers and kills your own command). Remove `after*/ control/ *.mjs` scratch.

## Model routing (bias cheaper)

- **Capture + compare = grunt → Haiku/Sonnet or run inline.** Deterministic scripts.
- **Interpreting a non-zero AE = judgment → top model.** Reading the red diff, tracing the cascade cause, deciding the fix.
