// Layout audit — three defect classes that a screenshot cannot show you,
// because all of them look deliberate.
//
//   1. A grid with more tracks than it has children. This is what a column
//      looks like after its contents move somewhere else: the track stays,
//      the remaining children shrink into the space left, and the result
//      reads as an intentional asymmetric layout. It shipped twice in the
//      shell work — the landing screen kept a stale two-column rule that
//      won on source order and pushed a column below the fold, and the CV
//      builder went on filling two thirds of a row for a side panel that
//      had moved onto the plate.
//
//   2. A box that draws a border or a fill and holds nothing. This is a
//      container that outlived its contents — on an empty board the offer
//      column drew a gold pill under one header and nothing under the other
//      four, which reads as a control someone forgot to fill in.
//
//   3. A row of children wider than the box holding them, with no wrap and
//      no scroller. Two shipped in the CV surface, and neither was visible
//      at the width or in the language anyone screenshotted: one spilled
//      quietly over the plate's padding in English and ran 45px off-screen
//      only in Dutch, the other only broke below about 340px. Hence the
//      widths and locales this now sweeps by default.
//
// Not a CI gate: it needs the dev server and a signed-in session, the same
// limitation scripts/dead-css.mjs has. Run it after moving anything around.
//
//   npm run dev
//   AUTH=path/to/storage-state.json node scripts/layout-audit.mjs
//
// AUTH is a Playwright storageState file. Without one the script still runs,
// but every route redirects to the login screen and finds nothing.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:5173";
const ROUTES = (
  process.env.ROUTES ??
  "/,/board,/feed,/people,/companies,/cv,/insights,/settings"
).split(",");
// 320 is not decoration: it is the width WCAG reflow is measured at, and the
// only one of the three that caught the CV card's footer counts.
const WIDTHS = (process.env.WIDTHS ?? "1440,414,320").split(",").map(Number);

// Both locales by default. The CV plate's action row was clean in English at
// every width and 45px off-screen in Dutch at 390 — an English-only audit
// reports a page that is broken for half its users as fine.
const LANGS = (process.env.LANGS ?? "en,nl").split(",");

function findings() {
  const orphanGrids = [];
  const emptyBoxes = [];
  const tightRows = [];

  // Containers only. A bar, a rule or an empty text field is empty on
  // purpose; the fault being hunted is a *container* that outlived what it
  // held, so widening the net past those just buries it in noise.
  const CONTAINERS = "div, section, ul, ol, li, aside, article, nav, header, footer";

  for (const el of document.querySelectorAll(CONTAINERS)) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;

    if (cs.display === "grid" || cs.display === "inline-grid") {
      const tracks = cs.gridTemplateColumns.split(" ").filter(Boolean);
      const kids = [...el.children].filter(
        (k) => getComputedStyle(k).display !== "none",
      );
      // A zero-width track is a track with nothing in it, which is the same
      // fault wearing a different number.
      const real = tracks.filter((t) => parseFloat(t) > 0);
      if (real.length >= 2 && kids.length && kids.length < real.length) {
        orphanGrids.push({
          el: el.className?.toString().slice(0, 50) || el.tagName,
          tracks: cs.gridTemplateColumns,
          children: kids.length,
        });
      }
    }

    // 3. A row of things wider than the box holding them, with no wrap and
    //    no scroller. Two of these shipped in the CV surface. Neither is
    //    visible in a screenshot at the width you happen to take it: the
    //    plate's action row spilled quietly over the plate's padding in
    //    English and only ran off-screen in Dutch, and the card's footer
    //    counts only broke below ~340px. What makes it a defect rather than
    //    a taste question is that flex has no answer here — the children
    //    have nothing left to give up, so the row just overflows.
    if (cs.display === "flex" || cs.display === "inline-flex") {
      const horizontal = cs.flexDirection.startsWith("row");
      const scrolls = /auto|scroll/.test(cs.overflowX);
      if (horizontal && cs.flexWrap === "nowrap" && !scrolls) {
        const kids = [...el.children].filter(
          (k) => getComputedStyle(k).display !== "none",
        );
        if (kids.length > 1) {
          const gap = parseFloat(cs.columnGap) || 0;
          const content =
            kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) +
            gap * (kids.length - 1);
          // clientWidth excludes the border, which is what the children are
          // laid out inside.
          if (content > el.clientWidth + 1) {
            tightRows.push({
              el: el.className?.toString().slice(0, 50) || el.tagName,
              content: Math.round(content),
              box: el.clientWidth,
            });
          }
        }
      }
    }

    const r = el.getBoundingClientRect();
    if (r.height < 10 || r.width < 10) continue;
    const draws =
      cs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      parseFloat(cs.borderTopWidth) > 0 ||
      parseFloat(cs.borderBottomWidth) > 0;
    if (!draws) continue;
    if ((el.textContent || "").trim()) continue;
    // A box whose whole job is to draw something — a bar, an icon, a
    // thumbnail — is empty of text on purpose.
    if (el.querySelector("svg, img, canvas, input, textarea, select, i, span"))
      continue;
    emptyBoxes.push({
      el: el.className?.toString().slice(0, 50) || el.tagName,
      box: [Math.round(r.width), Math.round(r.height)],
    });
  }
  return { orphanGrids, emptyBoxes, tightRows };
}

const browser = await chromium.launch();
let total = 0;

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      storageState: process.env.AUTH,
      viewport: { width, height: 1000 },
      isMobile: width < 700,
    });
    await context.addInitScript((l) => localStorage.setItem("zenith_lang", l), lang);
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const { orphanGrids, emptyBoxes, tightRows } = await page.evaluate(findings);
      if (orphanGrids.length || emptyBoxes.length || tightRows.length) {
        console.log(`\n${lang} ${width}px ${route}`);
        for (const g of orphanGrids)
          console.log(`  grid  ${g.el}: ${g.children} children, tracks ${g.tracks}`);
        for (const e of emptyBoxes)
          console.log(`  empty ${e.el}: ${e.box[0]}x${e.box[1]}`);
        for (const t of tightRows)
          console.log(`  tight ${t.el}: ${t.content}px of children in a ${t.box}px row, no wrap`);
        total += orphanGrids.length + emptyBoxes.length + tightRows.length;
      }
    }
    await context.close();
  }
}

await browser.close();
console.log(total === 0 ? "\nclean" : `\n${total} to look at`);
process.exit(total === 0 ? 0 : 1);
