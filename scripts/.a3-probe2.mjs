import { chromium, devices } from "playwright";
const AUTH = "/tmp/claude-1000/-home-ronald-Projects-github-com-ronaldlokers-Zenith/c301cfef-95c0-4954-8b28-1c20d71e4ece/scratchpad/auth.json";
const OUT = "/tmp/claude-1000/-home-ronald-Projects-github-com-ronaldlokers-Zenith/c301cfef-95c0-4954-8b28-1c20d71e4ece/scratchpad";
const browser = await chromium.launch();

// ---- A. layout-shift on load (content width before/after feed-triage exists) ----
{
  const c = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.route("**/api/feed**", async (r) => { await new Promise((s) => setTimeout(s, 1200)); r.continue(); });
  await p.goto("http://localhost:5173/feed");
  await p.waitForTimeout(400);
  const during = await p.evaluate(() => { const e = document.querySelector(".content"); const b = e.getBoundingClientRect(); return { w: +b.width.toFixed(0), x: +b.x.toFixed(0), hasTriage: !!document.querySelector(".feed-triage") }; });
  await p.screenshot({ path: `${OUT}/a3-desktop-loading.png` });
  await p.waitForTimeout(2500);
  const after = await p.evaluate(() => { const e = document.querySelector(".content"); const b = e.getBoundingClientRect(); return { w: +b.width.toFixed(0), x: +b.x.toFixed(0), hasTriage: !!document.querySelector(".feed-triage") }; });
  console.log("LOADING content:", JSON.stringify(during), "-> LOADED:", JSON.stringify(after));
  await c.close();
}

// ---- B. modifier-key guard: Ctrl+A / Cmd+D. Abort the mutating request so nothing commits. ----
{
  const c = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  const attempts = [];
  await p.route("**/api/**", async (r) => {
    const m = r.request().method();
    const u = r.request().url();
    if (m !== "GET") { attempts.push(m + " " + u.replace("http://localhost:5173", "")); return r.abort(); }
    return r.continue();
  });
  await p.goto("http://localhost:5173/feed", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.locator("body").click({ position: { x: 5, y: 500 } });
  const selBefore = await p.evaluate(() => window.getSelection()?.toString().length ?? -1);
  await p.keyboard.press("Control+a");
  await p.waitForTimeout(500);
  const selAfter = await p.evaluate(() => window.getSelection()?.toString().length ?? -1);
  console.log("Ctrl+A -> mutating requests attempted:", JSON.stringify(attempts), "| selection len before/after:", selBefore, selAfter);
  attempts.length = 0;
  await p.keyboard.press("Control+d");
  await p.waitForTimeout(500);
  console.log("Ctrl+D -> mutating requests attempted:", JSON.stringify(attempts));

  // focus after a dismiss (request aborted -> rollback, server untouched)
  attempts.length = 0;
  const focBefore = await p.evaluate(() => document.activeElement?.tagName + "." + (document.activeElement?.className || ""));
  await p.keyboard.press("j");
  await p.waitForTimeout(200);
  const focAfterJ = await p.evaluate(() => document.activeElement?.tagName + "." + (document.activeElement?.className || "").slice(0, 40));
  await p.keyboard.press("d");
  await p.waitForTimeout(120);
  const focAfterD = await p.evaluate(() => ({ active: document.activeElement?.tagName + "." + (document.activeElement?.className || "").slice(0, 40), cards: document.querySelectorAll(".feed-card").length, toasts: [...document.querySelectorAll("[class*=toast]")].map(t=>t.innerText) }));
  await p.waitForTimeout(900);
  const afterRollback = await p.evaluate(() => ({ cards: document.querySelectorAll(".feed-card").length, first: document.querySelector(".feed-card")?.innerText.split("\n")[0], order: [...document.querySelectorAll(".feed-card")].map(c=>c.innerText.split("\n")[0]) }));
  console.log("focus before/afterJ/afterD:", focBefore, "|", focAfterJ, "|", JSON.stringify(focAfterD));
  console.log("dismiss attempts:", JSON.stringify(attempts), "after rollback:", JSON.stringify(afterRollback));
  await c.close();
}

// ---- C. mobile swipe (frames spread across awaits), abort mutations ----
{
  const c = await browser.newContext({ ...devices["iPhone 13"], storageState: AUTH, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const p = await c.newPage();
  const attempts = [];
  await p.route("**/api/**", async (r) => {
    if (r.request().method() !== "GET") { attempts.push(r.request().method() + " " + r.request().url().replace("http://localhost:5173", "")); return r.abort(); }
    return r.continue();
  });
  await p.goto("http://localhost:5173/feed", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);

  const box = await p.locator(".feed-card").first().boundingBox();
  console.log("card box:", JSON.stringify(box));
  const cy = box.y + 30;

  // sub-threshold drag (40px) — expect tint class, no commit
  await p.touchscreen.tap(box.x + 20, cy).catch(()=>{});
  await p.evaluate(({x,y}) => {
    const el = document.elementFromPoint(x, y);
    window.__t = el.closest(".feed-card");
    const t = new Touch({ identifier: 1, target: window.__t, clientX: x, clientY: y });
    window.__t.dispatchEvent(new TouchEvent("touchstart", { touches: [t], targetTouches:[t], changedTouches: [t], bubbles: true }));
  }, { x: box.x + 40, y: cy });
  for (const dx of [10, 20, 30, 40]) {
    await p.evaluate(({x,y}) => {
      const t = new Touch({ identifier: 1, target: window.__t, clientX: x, clientY: y });
      window.__t.dispatchEvent(new TouchEvent("touchmove", { touches: [t], targetTouches:[t], changedTouches: [t], bubbles: true }));
    }, { x: box.x + 40 + dx, y: cy });
    await p.waitForTimeout(60);
  }
  const mid = await p.evaluate(() => { const e = document.querySelector(".feed-card"); return { cls: e.className, transform: e.style.transform, bg: getComputedStyle(e).backgroundColor }; });
  console.log("SUB-THRESHOLD (40px):", JSON.stringify(mid));
  await p.screenshot({ path: `${OUT}/a3-mobile-swipe-mid.png` });

  // continue past threshold to 140px
  for (const dx of [60, 80, 100, 120, 140]) {
    await p.evaluate(({x,y}) => {
      const t = new Touch({ identifier: 1, target: window.__t, clientX: x, clientY: y });
      window.__t.dispatchEvent(new TouchEvent("touchmove", { touches: [t], targetTouches:[t], changedTouches: [t], bubbles: true }));
    }, { x: box.x + 40 + dx, y: cy });
    await p.waitForTimeout(60);
  }
  const over = await p.evaluate(() => { const e = document.querySelector(".feed-card"); return { cls: e.className.slice(0,80), transform: e.style.transform, bg: getComputedStyle(e).backgroundColor }; });
  console.log("OVER-THRESHOLD (140px right):", JSON.stringify(over));
  await p.screenshot({ path: `${OUT}/a3-mobile-swipe-over.png` });
  await p.evaluate(({x,y}) => {
    const t = new Touch({ identifier: 1, target: window.__t, clientX: x, clientY: y });
    window.__t.dispatchEvent(new TouchEvent("touchend", { touches: [], targetTouches:[], changedTouches: [t], bubbles: true }));
  }, { x: box.x + 180, y: cy });
  await p.waitForTimeout(800);
  console.log("swipe-right commit -> mutating requests:", JSON.stringify(attempts));
  const post = await p.evaluate(() => ({ cards: document.querySelectorAll(".feed-card").length, toasts: [...document.querySelectorAll("[class*=toast],[role=status],[role=alert]")].map(t=>t.innerText).slice(0,3) }));
  console.log("post-swipe:", JSON.stringify(post));

  // occlusion: is the last card's Dismiss button hit-testable?
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(500);
  const occl = await p.evaluate(() => {
    const btns = [...document.querySelectorAll(".feed-card .feed-row-actions button")];
    const last = btns[btns.length - 1];
    if (!last) return "no match";
    const b = last.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { label: last.innerText, rect: { y: +b.y.toFixed(0), h: +b.height.toFixed(0) }, vh: window.innerHeight, hitIsButton: hit === last || last.contains(hit), hitEl: hit?.tagName + "." + (hit?.className || "").slice(0, 40) };
  });
  console.log("LAST BUTTON OCCLUSION:", JSON.stringify(occl));
  await p.screenshot({ path: `${OUT}/a3-mobile-bottom.png` });
  await c.close();
}
await browser.close();
