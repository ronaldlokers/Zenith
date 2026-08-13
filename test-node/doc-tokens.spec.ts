// The CV preview renders a simulated A4 sheet, so it deliberately runs on a
// second unit system: px sizes that are fractions of a page rather than of
// the reader's text size, and document ink rather than app ink. That was
// carried as ~17 literals in App.css, which reads as drift and buries real
// drift in the noise.
//
// Naming them was meant to change nothing on screen, so this pins the values
// to exactly what the preview rendered before. A change here is either a
// deliberate redesign of the document or an accident, and both should have
// to be typed out.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX = readFileSync(join(__dirname, "../src/index.css"), "utf8");
const APP = readFileSync(join(__dirname, "../src/App.css"), "utf8");

// The values the CV preview shipped with before the tokens existed.
const DOC = {
  "--doc-ground": "#ffffff",
  "--doc-aside": "#f2f0ea",
  "--doc-ink": "#1b1d2e",
  "--doc-heading": "#14173a",
  "--doc-muted": "#4a4d63",
  "--doc-faint": "#6b675e",
  "--doc-rule": "#d8d5cc",
  // Typed out, because this was a deliberate redesign of the document: the
  // preview is laid out at real A4 now and scaled as a whole, so its type is
  // the export's own — 10pt body, 20pt name, read off generateCvPdf — rather
  // than px fractions chosen to fit a narrow column. The old values showed
  // roughly 3.5x more content per apparent page than the PDF they previewed,
  // which made "does this fit on one page" unanswerable on the surface whose
  // job is to answer it. The remaining two keep their old ratio to the body
  // (8/8.5 and 13/15) so the two-column template's aside is unchanged in
  // proportion.
  "--doc-text": "10pt",
  "--doc-small": "9.4pt",
  "--doc-fine": "8.8pt",
  "--doc-name": "20pt",
  "--doc-name-aside": "17.3pt",
  "--doc-radius": "3px",
  "--doc-radius-fine": "1px",
};

// Printing the app is a third context: not app UI, and not the simulated
// sheet the CV preview draws. Same values as the document today, different
// meaning, so they get their own names.
// Optical glyph sizing: deliberately off the reading ramp, so it needs a
// name and a pinned value rather than looking like a stray literal.
const GLYPH = { "--text-glyph": "0.6rem" };

const PRINT = {
  "--print-ground": "#ffffff",
  "--print-ink": "#000000",
};

describe("the printed-page token family", () => {
  for (const [token, value] of Object.entries(DOC)) {
    it(`${token} still renders ${value}`, () => {
      const m = INDEX.match(new RegExp(`${token}:\\s*([^;]+);`));
      expect(m, `${token} is declared`).toBeTruthy();
      expect(m![1].trim()).toBe(value);
    });
  }

  for (const [token, value] of Object.entries(GLYPH)) {
    it(`${token} still renders ${value}`, () => {
      const m = INDEX.match(new RegExp(`${token}:\\s*([^;]+);`));
      expect(m, `${token} is declared`).toBeTruthy();
      expect(m![1].trim()).toBe(value);
    });
  }

  for (const [token, value] of Object.entries(PRINT)) {
    it(`${token} still renders ${value}`, () => {
      const m = INDEX.match(new RegExp(`${token}:\\s*([^;]+);`));
      expect(m, `${token} is declared`).toBeTruthy();
      expect(m![1].trim()).toBe(value);
    });
  }

  it("leaves no colour, size or radius literal in the .cv-doc family", () => {
    // Walks each rule and checks the ones the document owns.
    const offenders: string[] = [];
    const ruleRe = /([^{}]+)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(APP))) {
      const selector = m[1].split("\n").pop()!.trim();
      if (!/cv-doc|cv-t-line/.test(selector)) continue;
      for (const decl of m[2].split(";")) {
        if (!/font-size|border-radius|color|background/.test(decl)) continue;
        if (decl.includes("var(")) continue;
        if (/#[0-9a-f]{3,6}|[\d.]+px/i.test(decl)) {
          offenders.push(`${selector} {${decl.trim()} }`);
        }
      }
    }
    expect(offenders, "literals left in the document styles").toEqual([]);
  });
});
