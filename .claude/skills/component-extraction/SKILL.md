---
name: component-extraction
description: Use when extracting a UI pattern from src/App.tsx / a feature file into a self-contained owned component in src/components (or porting one from the design bundle). Covers reproducing the App.css recipe under @layer components, the zui- class convention, adopting call sites, removing dead CSS, and the zero-diff guarantee. Load before starting any "turn this markup/recipe into a component" task.
---

Turn an app UI pattern (a `.classname` recipe + its markup) into a self-contained owned component in `src/components/`, adopted at its call sites with **zero visual change**. Every component here follows this loop. The convention is also documented in the repo CLAUDE.md ("Owned components").

## Core principle: self-contained

A component's CSS lives **entirely in `@layer components`** (in its own `<Name>.css`) and **fully describes** it — it reproduces the App.css recipe it replaces, never depends on it. Storybook loads only the design tokens (`src/index.css` via `.storybook/preview-styles.css`), no App.css, so a component must render there exactly as it ships. Classes are renamed to a `zui-<name>` prefix so the component owns them.

Cascade in the app: `@layer reset, app, components` (src/app-styles.css → index.css=reset, App.css=app, component CSS=components).

## The loop

1. **Survey.** Find EVERY App.css rule for the pattern — the base rule, variants, `:hover`/`:active`, `@media` blocks, AND shared grouped selectors (e.g. `.btn-secondary, .form-actions button, …`). Grep each candidate class across `src/*.tsx` to classify **own** (single-owner → move) vs **shared** (used elsewhere → leave in App.css). List every className the markup emits (including template-literal `` `x ${cond?"y":""}` ``).

2. **Create** `src/components/<Name>.{tsx,css,stories.tsx,test.tsx}`. Match an existing component exactly (read Button/Row/Badge first). TSX: `zui-<name>` classes via `["zui-x", variant && \`zui-x--${variant}\`, className].filter(Boolean).join(" ")`; forward `...rest`; default `type="button"` for buttons. For patterns whose inner structure varies (list rows, cards, chips), make it a **container**: reproduce the wrapper + descendant rules, pass the sub-structure as `children` verbatim (callers keep the inner class names; the component's CSS targets `.zui-x .inner`). CSS: wrap in `@layer components {}`, reproduce the recipe with line-number comments. Story `Core/<Name>` (or `Feature/<Name>` for app-shell widgets); tests assert it emits `zui-` not the legacy class.

3. **Export** from `src/components/index.ts`.

4. **Adopt** the call sites. Drop the recipe class token (e.g. `primary`/`danger`), keep layout tokens. Preserve the element's **effective type** (a bare `<button>` inside a `<form>` is an implicit submit — pass `type="submit"`). Forward all props. Perl for uniform swaps; targeted edits otherwise.

5. **Remove dead App.css.** Delete only rules now unused. For a **shared grouped rule**, remove only this class's entry, keep the other selectors. Update the ancestor-context overrides too (e.g. `.side .thing`, `.form .thing`) — rename to the new class or they silently stop matching.

6. **Verify zero-diff** — invoke the `zero-diff-verify` skill (`compare -metric AE = 0` after-vs-control). Non-negotiable for anything visible.

7. **Gate + PR.** `npx tsc -b`, `npm run build`, `npx oxlint`, `npx vitest run --no-file-parallelism`. Commit component + adoption separately. Open PR, watch CI, merge.

## The traps (these WILL bite — all hit at least once)

- **Layer priority is per-property, and `@layer components` OUTRANKS `@layer app`.** A property that was **inert** in App.css — overridden by a *later same-layer* rule by source order (e.g. `.cal-nav { padding }` losing to a later `.btn-secondary` in the same layer) — becomes **active** once moved into a component and shifts the render. When a moved rule's class combines with a **shared/kept** class, reproduce only the value that was **actually effective** in the original cascade; omit the overridden one (let the shared class supply it).
- **Unlayered CSS beats ALL layered CSS**, regardless of specificity. Never import a stylesheet unlayered into the component/Storybook.
- **Context-dependent recipes.** A raw element inherits typography and is normalized by container rules — e.g. `button.primary` sets no font-size (inherits 1rem standalone, but `.form-actions button` gives it `--text-body` in a container). A faithful variant must let that cascade through (scope with `:not()`) rather than hardcode one value.
- **`*/` inside a `/* comment */` closes it early** and breaks the CSS build. Never write `.foo*/.bar` in a comment — use `.foo / .bar`.
- **Container-normalization coupling.** If the container styles its `<Button>`/input children (`.form-actions .zui-btn--md`, `.toolbar input`), renaming the container breaks those — re-home the child-normalization into the new component's CSS and trim the old rules from App.css + Button.css.

## Model routing (bias cheaper — matches ~/.claude/CLAUDE.md)

- **Per-component create + adopt → Sonnet subagent.** Routine implementation: reproduce recipe, rename to `zui-`, write story/test, swap call sites. Give the subagent the exact recipe (line numbers) + the trap list above; tell it NOT to touch index.ts/App.css if you're integrating centrally, or to do the full move if it's a self-contained widget. Parallel-safe only across DIFFERENT files (index.ts/App.css/App.tsx are shared — serialize those).
- **Scope, trap-handling, and non-zero-diff interpretation → main loop (Opus).** Deciding what's in scope (which sites truly map), catching the layer-priority flips, and reading a red diff image are judgment.
