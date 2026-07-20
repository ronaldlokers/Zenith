---
name: zenith-design
description: Use this skill to generate well-branded interfaces and assets for Zenith, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference
- **Brand:** Zenith — job-application tracker. "Ascent" direction: the pipeline is a climb toward a peak.
- **Palette:** Night `#14173a` (base) + Gold `#d6a441` (single accent). Ascent stage colors are accessibility-locked — pipeline state only, never decoration.
- **Type:** Geist (wordmark/headings 600, body 400) + Geist Mono (chrome/meta). Loaded via Google Fonts.
- **Logo:** `assets/logo.svg` — Night squircle, three-rung ascent path rising to a gold peak-star.
- **Tokens:** `styles.css` @imports everything; token files in `tokens/`. Dark theme under `:root[data-theme="dark"]`.
- **Components:** `components/core/` (Button, Badge, StatusBadge, Card) + icon set in `assets/icons.tsx`.
