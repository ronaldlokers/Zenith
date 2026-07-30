// Captures every Storybook story, in both themes, as an isolated PNG so two
// runs can be diffed the same way scripts/screenshot-baseline.mjs diffs the
// running app (`compare -metric AE`).
//
// WHY THIS HARNESS EXISTS, AND WHY screenshot-baseline.mjs CANNOT DO ITS JOB:
// The owned components in src/components/ are required to fully describe
// themselves in their own @layer components stylesheet and never depend on
// src/App.css (Storybook proves this by loading none of it — see
// .storybook/preview-styles.css, which imports only src/index.css). But
// screenshot-baseline.mjs photographs the production APP, and the app always
// loads App.css. A component that silently borrows an App.css class (e.g.
// `className="muted"`) renders identically in the app whether or not its own
// CSS defines `.muted` — so that harness reports zero diff on a component
// that is actually broken the moment it is dropped into the catalog alone.
// This harness photographs the catalog itself, where that class resolves to
// nothing, so the defect is visible as a pixel diff instead of invisible.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STORYBOOK_DIR = process.env.STORYBOOK_DIR ?? join(ROOT, "storybook-static");
const OUT = process.env.OUT_DIR ?? "storybook-shots";
const PORT = Number(process.env.PORT ?? 6007);
const BASE = `http://localhost:${PORT}`;
const THEMES = ["light", "dark"];
// A fixed viewport, not the app harness's desktop+mobile pair: a story is a
// single isolated component, not a page layout, so there is no responsive
// breakpoint to prove here — only that the component paints correctly. Wide
// enough that flex-wrap groups (Button's Variants story, etc.) lay out the
// same way every run.
const VIEWPORT = { width: 1280, height: 900 };

// --- 1. Build Storybook fresh -----------------------------------------
// Rebuilding on every invocation (rather than trusting whatever is already
// on disk) matters for the same reason the app harness insists on a fresh
// login: this harness's own proof (build → capture → tweak a component →
// rebuild → capture → diff → revert → rebuild → capture → diff) only means
// anything if each capture reflects the CURRENT source tree, not a stale
// build left over from a previous run.
console.log(`Building Storybook into ${STORYBOOK_DIR} ...`);
const build = spawnSync("npx", ["storybook", "build", "--quiet", "-o", STORYBOOK_DIR], {
  cwd: ROOT,
  stdio: "inherit",
});
if (build.status !== 0) {
  console.error("Storybook build failed — refusing to capture against a stale or absent build.");
  process.exit(1);
}

const indexPath = join(STORYBOOK_DIR, "index.json");
if (!existsSync(indexPath)) {
  console.error(`No index.json at ${indexPath} — Storybook build did not produce a story index.`);
  process.exit(1);
}

// --- 2. Enumerate stories from the index, not a hardcoded list --------
// A story that exists but is never captured is exactly the silent-coverage
// hole this project has already hit twice (see screenshot-baseline.mjs's
// comment on the card/row menu popovers). Reading index.json means a newly
// added *.stories.tsx file is covered automatically, with no harness edit.
const index = JSON.parse(readFileSync(indexPath, "utf8"));
const stories = Object.values(index.entries ?? {}).filter((e) => e.type === "story");
if (stories.length === 0) {
  console.error("index.json contains zero stories — refusing to run a harness that captures nothing.");
  process.exit(1);
}
console.log(`Found ${stories.length} stories in the index.`);

// --- 3. Serve the static build ------------------------------------------
// The story index and iframe.html are only meaningful over http(s): Storybook
// resolves module and font URLs relative to the served origin, and file://
// breaks that. A throwaway static file server is enough — no framework
// needed for a directory of pre-built assets.
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".ico": "image/x-icon",
};
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, BASE).pathname);
  const filePath = join(STORYBOOK_DIR, pathname === "/" ? "/index.html" : pathname);
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
  res.end(readFileSync(filePath));
});
await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`Serving ${STORYBOOK_DIR} at ${BASE}`);

mkdirSync(OUT, { recursive: true });

// Playwright's virtual pointer stays wherever it last moved, and it carries
// across page.goto — so after the previous story's screenshot the NEXT
// story can render with :hover applied to whatever now sits under those
// coordinates. screenshot-baseline.mjs hit exactly this (see its comment on
// (797, 342) landing on a board card) and settled on parking the pointer at
// the fixed, always-safe (0, 0) corner before every screenshot.
const parkPointer = (page) => page.mouse.move(0, 0);

// Parking the pointer alone is not enough: moving off an element starts its
// hover transition, and a transition mid-flight is a race against the
// screenshot, not a fixed state. screenshot-baseline.mjs measured this race
// landing wrong roughly one run in three. Freeze motion outright — this
// removes transitions/animations, never steady-state appearance — instead of
// widening a wait, which would only make the race rarer, not gone.
const freezeMotion = (page) =>
  page.addStyleTag({
    content: `*, *::before, *::after {
      transition: none !important;
      animation: none !important;
      caret-color: transparent !important;
    }`,
  });

// Chromium re-rasterises only the tiles it considers damaged. Driving every
// story through one reused page (cheaper than a fresh page per story, and
// exactly the pattern screenshot-baseline.mjs uses per viewport) means which
// tiles are "damaged" when a story paints depends on what the previous story
// left behind — and that produced two stable renderings of the same page,
// not real drift, in the app harness. --disable-partial-raster fixed it
// there (8/8 identical) for near-zero visual cost; reproduce it here rather
// than rediscover the same coin flip.
const browser = await chromium.launch({ args: ["--disable-partial-raster"] });

// Some components read the wall clock indirectly — e.g. CalendarMonth's
// "today" highlight comes from src/format.ts's today(), which is
// `new Date().toISOString().slice(0, 10)`. Left unpinned, a capture taken on
// a different day than its comparison would differ on views nobody touched,
// which is indistinguishable from a real regression. Pin to the same instant
// screenshot-baseline.mjs uses, so a capture depends only on code, not date.
const FIXED_NOW = process.env.FIXED_NOW ?? "2026-07-29T12:00:00.000Z";

const context = await browser.newContext({ viewport: VIEWPORT });
await context.clock.setFixedTime(new Date(FIXED_NOW));
const page = await context.newPage();

let captured = 0;
for (const theme of THEMES) {
  for (const story of stories) {
    // viewMode=story renders the bare component in its own iframe, with none
    // of the manager UI (sidebar, toolbar, addons panel) around it — that
    // chrome would swamp a pixel diff with content unrelated to the
    // component under test.
    const url = `${BASE}/iframe.html?id=${story.id}&viewMode=story`;
    await page.goto(url, { waitUntil: "networkidle" });

    // Set the theme directly on the document rather than through the
    // toolbar's globals mechanism: preview.jsx's WithTheme decorator expresses
    // "auto" as the ABSENCE of data-theme, so a URL-driven global would still
    // leave us inferring the light/dark split from prefers-color-scheme,
    // which is exactly the ambiguity a fixed-attribute capture is supposed to
    // remove. Setting the attribute ourselves, after the decorator's own
    // mount effect has already run (networkidle implies React has painted),
    // pins it unambiguously for both runs being diffed.
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);

    const root = page.locator("#storybook-root");
    const rootCount = await root.count();
    const box = rootCount ? await root.boundingBox() : null;
    // A missing root, or one with no painted area, means the story errored
    // or rendered nothing — capturing "success" in that case would be the
    // same silent-coverage hole this project has already paid for twice
    // (see the interaction-selector check in screenshot-baseline.mjs).
    if (!rootCount || !box || box.width === 0 || box.height === 0) {
      console.error(`Story ${story.id} (${theme}) has no rendered #storybook-root — refusing to skip silently.`);
      process.exit(1);
    }

    await freezeMotion(page);
    await parkPointer(page);
    // Re-assert the theme attribute after freezeMotion's addStyleTag: belt
    // and braces against any effect that might have re-run between the two
    // evaluate calls above and this screenshot.
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);

    const filename = `${story.id}--${theme}.png`;
    await root.screenshot({ path: `${OUT}/${filename}` });
    captured++;
    console.log(`captured ${filename}`);
  }
}

await context.close();
await browser.close();
server.close();

console.log(`Captured ${captured} screenshots (${stories.length} stories x ${THEMES.length} themes) into ${OUT}/`);
