import { chromium, devices } from "playwright";

const AUTH = "/tmp/claude-1000/-home-ronald-Projects-github-com-ronaldlokers-Zenith/c301cfef-95c0-4954-8b28-1c20d71e4ece/scratchpad/auth.json";
const OUT = "/tmp/claude-1000/-home-ronald-Projects-github-com-ronaldlokers-Zenith/c301cfef-95c0-4954-8b28-1c20d71e4ece/scratchpad";

const browser = await chromium.launch();

// ---------- desktop ----------
const ctx = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await p.goto("http://localhost:5173/feed", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);

const count = await p.locator(".feed-card").count();
console.log("DESKTOP feed cards:", count);
console.log("bands:", await p.locator(".feed-band").allInnerTexts());
console.log("detail present:", await p.locator(".feed-detail").count());

await p.screenshot({ path: `${OUT}/a3-desktop-feed.png`, fullPage: false });
await p.screenshot({ path: `${OUT}/a3-desktop-feed-full.png`, fullPage: true });

// toolbar / controls geometry
const geo = await p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return "no match"; const b = e.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  return {
    toolbar: r(".toolbar, [class*=toolbar]"),
    controls: r(".feed-controls"),
    list: r(".feed-list"),
    detail: r(".feed-detail"),
    firstCard: r(".feed-card"),
    hint: r(".feed-detail-hint"),
    hintText: document.querySelector(".feed-detail-hint")?.textContent ?? "no match",
    cardActionsVisible: (() => { const e = document.querySelector(".feed-list .feed-row-actions"); if (!e) return "no match"; return getComputedStyle(e).display; })(),
    matchBarFirst: (() => { const e = document.querySelector(".feed-match-bar > i"); if (!e) return "no match"; return getComputedStyle(e).width; })(),
    firstCardText: document.querySelector(".feed-card")?.innerText ?? "no match",
  };
});
console.log("GEO", JSON.stringify(geo, null, 1));

// keyboard triage: j x3, k x1 — read focus, no destructive a/d
await p.locator("body").click({ position: { x: 5, y: 400 } });
const beforeSel = await p.evaluate(() => document.querySelector(".feed-card.sel")?.innerText?.slice(0, 60) ?? "none");
await p.keyboard.press("j"); await p.waitForTimeout(150);
await p.keyboard.press("j"); await p.waitForTimeout(150);
const afterJ = await p.evaluate(() => ({
  sel: document.querySelector(".feed-card.sel")?.innerText?.slice(0, 60) ?? "none",
  activeIsCard: document.activeElement?.classList?.contains("feed-card") ?? false,
  activeTag: document.activeElement?.tagName,
  detailTitle: document.querySelector(".feed-detail h2")?.textContent ?? "no match",
  selInView: (() => { const e = document.querySelector(".feed-card.sel"); if (!e) return "no match"; const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; })(),
}));
console.log("before j:", beforeSel);
console.log("after jj:", JSON.stringify(afterJ));

// press j many times to test scrolling into view at bottom
for (let i = 0; i < 12; i++) { await p.keyboard.press("j"); await p.waitForTimeout(60); }
const deep = await p.evaluate(() => {
  const e = document.querySelector(".feed-card.sel");
  if (!e) return "no match";
  const b = e.getBoundingClientRect();
  return { top: +b.top.toFixed(0), bottom: +b.bottom.toFixed(0), vh: window.innerHeight, scrollY: window.scrollY, text: e.innerText.slice(0,40) };
});
console.log("after 14 j:", JSON.stringify(deep));
await p.screenshot({ path: `${OUT}/a3-desktop-deep-j.png` });

// sort + minfit
await p.locator(".feed-controls button", { hasText: "Best match" }).first().click().catch(()=>{});
await p.waitForTimeout(400);
console.log("after sort=match bands:", await p.locator(".feed-band").allInnerTexts());
await p.screenshot({ path: `${OUT}/a3-desktop-sort-match.png` });

const fitBtns = await p.locator(".feed-controls [role=group]").nth(1).locator("button").allInnerTexts();
console.log("fit buttons:", fitBtns);
await p.locator(".feed-controls [role=group]").nth(1).locator("button").nth(3).click();
await p.waitForTimeout(400);
console.log("after minfit=3 cards:", await p.locator(".feed-card").count(), "nomatch:", await p.locator(".feed-nomatch").innerText().catch(()=>"no match"));
await p.screenshot({ path: `${OUT}/a3-desktop-minfit3.png` });
await p.locator(".feed-controls [role=group]").nth(1).locator("button").nth(0).click();
await p.waitForTimeout(300);

// tab-order / a11y probe
const a11y = await p.evaluate(() => {
  const cards = [...document.querySelectorAll(".feed-card")];
  return {
    n: cards.length,
    tabIndexes: cards.slice(0, 6).map((c) => c.getAttribute("tabindex")),
    ariaCurrent: cards.slice(0, 6).map((c) => c.getAttribute("aria-current")),
    listRole: document.querySelector(".feed-list")?.getAttribute("role") ?? "none",
    bandIsLi: document.querySelector(".feed-band")?.tagName ?? "no match",
    detailLive: document.querySelector(".feed-detail")?.getAttribute("aria-live") ?? "none",
    headings: [...document.querySelectorAll("h1,h2,h3")].map(h=>h.tagName+": "+h.textContent.slice(0,40)),
    matchBarAria: (() => { const e = document.querySelector(".feed-match"); if (!e) return "no match"; return { title: e.getAttribute("title"), role: e.getAttribute("role"), text: e.innerText }; })(),
  };
});
console.log("A11Y", JSON.stringify(a11y, null, 1));

// "Check now" — network assertion, don't await long
const reqs = [];
p.on("request", (r) => { if (r.url().includes("/api/")) reqs.push(r.method()+" "+r.url().replace("http://localhost:5173","")); });
const checkBtn = p.locator("button", { hasText: /Check now/ }).first();
console.log("checkNow exists:", await checkBtn.count());

console.log("console errors:", errs.slice(0, 5));
await ctx.close();

// ---------- mobile ----------
const m = await browser.newContext({
  ...devices["iPhone 13"],
  storageState: AUTH,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
const mp = await m.newPage();
await mp.goto("http://localhost:5173/feed", { waitUntil: "networkidle" });
await mp.waitForTimeout(1500);
console.log("MOBILE cards:", await mp.locator(".feed-card").count());
await mp.screenshot({ path: `${OUT}/a3-mobile-feed.png` });
await mp.screenshot({ path: `${OUT}/a3-mobile-feed-full.png`, fullPage: true });

const mgeo = await mp.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return "no match"; const b = e.getBoundingClientRect(); return { x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1) }; };
  const btns = [...document.querySelectorAll(".feed-card .feed-row-actions button")].slice(0,4).map(b=>{const x=b.getBoundingClientRect();return {t:b.innerText,w:+x.width.toFixed(0),h:+x.height.toFixed(0)};});
  return {
    detailDisplay: document.querySelector(".feed-detail") ? getComputedStyle(document.querySelector(".feed-detail")).display : "no element",
    controls: r(".feed-controls"),
    controlsWrapped: (()=>{const e=document.querySelector(".feed-controls"); if(!e) return "no match"; return [...e.children].map(c=>({tag:c.tagName,y:+c.getBoundingClientRect().y.toFixed(0),h:+c.getBoundingClientRect().height.toFixed(0)}));})(),
    actionBtns: btns,
    card: r(".feed-card"),
    strip: (()=>{const e=document.querySelector(".feed-strip"); if(!e) return "no match"; return {text:e.innerText, w:+e.getBoundingClientRect().width.toFixed(0)};})(),
    hintPresent: document.querySelector(".feed-detail-hint") ? "yes" : "no (hidden with detail pane)",
    touchAction: getComputedStyle(document.querySelector(".feed-card")).touchAction,
    docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
  };
});
console.log("MOBILE GEO", JSON.stringify(mgeo, null, 1));

await browser.close();
