// The stage palette's guarantees, enforced rather than asserted in prose
// (#496). The old rule froze five hex values and called that accessibility;
// measured, that palette put applied and screening at ΔE 1.0 under
// deuteranopia — the same colour to roughly 6% of men. What is locked now is
// the property, not the value: any five hues may ship provided they stay
// separable under every vision model and remain readable as label text.
//
// Reads src/index.css directly, so editing a token by eye and skipping the
// maths fails here instead of in someone's hands.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(__dirname, "../src/index.css"), "utf8");

const STAGES = ["interested", "applied", "screening", "interview", "offer"] as const;

// Below ΔE 10 two colours read as "the same at a glance"; below 5 they are
// indistinguishable. 10 is the floor, and the shipped set clears 12.
const MIN_DELTA_E = 10;
// The stage label is 0.64rem — normal-size text, so WCAG AA is 4.5:1.
const MIN_TEXT_CONTRAST = 4.5;

type RGB = [number, number, number];

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--(st-[a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    out[m[1].toLowerCase()] = m[2].toLowerCase();
  }
  return out;
}

/** The `:root` block, and the explicit-dark block that mirrors it. */
// One theme since the light-only decision (see
// docs/superpowers/specs/2026-08-12-fizzy-shell-design.md). The function
// still returns a list so the separation matrix below reads unchanged, and
// so a second ground can be added back without reshaping the suite.
function themeBlocks(): { name: string; vars: Record<string, string>; grounds: RGB[] }[] {
  const rootStart = CSS.indexOf(":root {");
  const rootEnd = CSS.indexOf("color-scheme: light;");
  expect(rootStart, ":root block").toBeGreaterThan(-1);
  expect(rootEnd, "end-of-:root marker").toBeGreaterThan(rootStart);
  return [
    { name: "light", vars: tokens(CSS.slice(rootStart, rootEnd)), grounds: [hex("#ffffff"), hex("#f4f2ec")] },
  ];
}

function hex(h: string): RGB {
  const v = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as RGB;
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function relLuminance([r, g, b]: RGB): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function toLab([r, g, b]: RGB): [number, number, number] {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000. */
function deltaE(c1: RGB, c2: RGB): number {
  const [L1, a1, b1] = toLab(c1);
  const [L2, a2, b2] = toLab(c2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T =
    1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTh = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

// Viénot, Brettel & Mollon dichromat simulation, applied in linear RGB.
const CVD: Record<string, number[][]> = {
  protanopia: [[0.11238, 0.88762, 0], [0.11238, 0.88762, 0], [0.00401, -0.00401, 1]],
  deuteranopia: [[0.29275, 0.70725, 0], [0.29275, 0.70725, 0], [-0.02234, 0.02234, 1]],
  tritanopia: [[1, 0.14461, -0.14461], [0, 0.85659, 0.14341], [0, 0.85659, 0.14341]],
};

function simulate(c: RGB, kind: string): RGB {
  const m = CVD[kind];
  if (!m) return c;
  const l = c.map(lin);
  const out = m.map((row) => row.reduce((acc, k, i) => acc + k * l[i], 0));
  const back = (v: number) => {
    const x = Math.max(0, Math.min(1, v));
    return (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255;
  };
  return out.map(back) as RGB;
}

describe("stage palette", () => {
  const themes = themeBlocks();

  it("defines a field and an ink token for every stage, in both themes", () => {
    for (const { name, vars } of themes) {
      for (const s of [...STAGES, "dead"]) {
        expect(vars[`st-${s}`], `--st-${s} missing in ${name}`).toBeTruthy();
        expect(vars[`st-${s}-ink`], `--st-${s}-ink missing in ${name}`).toBeTruthy();
      }
    }
  });

  it.each(["normal", "protanopia", "deuteranopia", "tritanopia"])(
    "keeps every pair of stages apart under %s",
    (vision) => {
      for (const { name, vars } of themes) {
        const cols = STAGES.map((s) => hex(vars[`st-${s}`]));
        for (let i = 0; i < cols.length; i++) {
          for (let j = i + 1; j < cols.length; j++) {
            const d = deltaE(simulate(cols[i], vision), simulate(cols[j], vision));
            expect(
              d,
              `${name}: ${STAGES[i]} vs ${STAGES[j]} under ${vision} is ΔE ${d.toFixed(1)}`,
            ).toBeGreaterThanOrEqual(MIN_DELTA_E);
          }
        }
      }
    },
  );

  it("keeps every stage readable as label text on both grounds", () => {
    for (const { name, vars, grounds } of themes) {
      for (const s of STAGES) {
        for (const g of grounds) {
          const c = contrast(hex(vars[`st-${s}-ink`]), g);
          expect(c, `${name}: --st-${s}-ink is ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(
            MIN_TEXT_CONTRAST,
          );
        }
      }
    }
  });

  // The shell fills small surfaces with the ink tone and prints white on
  // them. That is only defensible while the ink tones stay dark enough, and
  // a hue retune would silently take it away.
  it("keeps white readable on a stage's ink tone, which the shell fills with", () => {
    for (const { name, vars } of themes) {
      for (const s of STAGES) {
        const c = contrast(hex(vars[`st-${s}-ink`]), hex("#ffffff"));
        expect(
          c,
          `${name}: white on --st-${s}-ink is ${c.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  // The counterpart, pinned so the distinction cannot quietly collapse: the
  // field colours are NOT safe grounds, which is why the fills use the ink
  // tone rather than --sc. If a retune ever made a field colour safe, this
  // fails and the rule gets rewritten deliberately rather than by accident.
  it("still cannot print type on a stage's field colour", () => {
    for (const { name, vars } of themes) {
      const worst = Math.min(
        ...STAGES.map((s) => contrast(hex(vars[`st-${s}`]), hex("#ffffff"))),
      );
      expect(
        worst,
        `${name}: white on the worst field colour is ${worst.toFixed(2)}:1`,
      ).toBeLessThan(MIN_TEXT_CONTRAST);
    }
  });

  it("keeps the brass text tone readable, since its name promises it", () => {
    const light = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("color-scheme: light dark;"));
    const ink = light.match(/--accent-ink:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(ink).toBeTruthy();
    for (const g of ["#ffffff", "#f4f2ec"]) {
      expect(contrast(hex(ink!), hex(g))).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });
});

// The rule about filled grounds is narrower than it first read, and the
// difference is which tone is doing the filling:
//
//   - The FIELD colours (--st-*) cannot be grounds for type. White is the
//     best ink available and it manages only 3.62:1 on interview. That is
//     what "never a filled ground with type on it" is about, and it still
//     holds.
//   - The INK tones (--st-*-ink) can. White clears 4.5:1 on every one of
//     them, 5.11:1 at the worst (screening).
//
// The shell (#535) uses the second: the folded rail's count circle, the
// detail page's current stage, and the narrow board's active stage chip are
// all white on the ink tone. The test below is what stops that becoming
// unreadable if a hue is ever retuned.
