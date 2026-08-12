import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// component-self-containment.spec.ts opens by saying a component that borrows
// a class from App.css "renders differently in Storybook (which loads no
// App.css) than in the app". That parenthetical is the premise the whole
// component architecture rests on, and nothing checked it.
//
// Add `@import "../src/App.css"` to the preview and every borrow starts
// rendering correctly in Storybook. The catalog would agree with the app
// while the components stopped being self-contained, which is the one failure
// the other spec cannot see — it reads component source, not the harness.
//
// The layer order matters as much as the contents. Layer priority is
// per-property and beats specificity, so a preview that declared
// `@layer components, app, reset` would flip which rules win and show every
// component wrong while importing exactly the right files.
const ROOT = new URL("..", import.meta.url).pathname;
const PREVIEW = path.join(ROOT, ".storybook/preview-styles.css");
const APP_STYLES = path.join(ROOT, "src/app-styles.css");

// Both files explain themselves at length, and both comments name App.css and
// quote @layer statements. Parsing the raw text finds those and reports a
// working cascade as broken — which is what the first run of this spec did.
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const preview = stripComments(readFileSync(PREVIEW, "utf8"));

function layerOrder(css: string): string[] {
  const m = css.match(/@layer\s+([^;]+);/);
  return m ? m[1].split(",").map((s) => s.trim()) : [];
}

function imports(css: string): { file: string; layer: string | null }[] {
  return [...css.matchAll(/@import\s+"([^"]+)"(?:\s+layer\(([^)]+)\))?/g)].map(
    (m) => ({ file: m[1], layer: m[2] ?? null }),
  );
}

describe("storybook cascade", () => {
  it("loads no App.css, and no view stylesheet standing in for it", () => {
    // Not just App.css by name: importing src/board.css or src/cv/cv.css
    // would smuggle the same problem in under a different file.
    const OWN = new Set(["../src/index.css", "../src/utilities.css"]);
    const smuggled = imports(preview)
      .map((i) => i.file)
      .filter((f) => f.startsWith("../src/") && !OWN.has(f));
    expect(
      smuggled,
      "Storybook must load only the tokens/reset and the shared utilities — " +
        "self-containment is only meaningful while it does",
    ).toEqual([]);
    expect(
      imports(preview).map((i) => i.file),
      "App.css must not reach Storybook by any path",
    ).not.toContain("../src/App.css");
  });

  it("declares the same layer order as the app", () => {
    // Same names in the same sequence, or the catalog ranks rules differently
    // from the thing it is a catalog of.
    const app = layerOrder(stripComments(readFileSync(APP_STYLES, "utf8")));
    expect(app, "src/app-styles.css lost its @layer statement").toEqual([
      "reset",
      "app",
      "components",
    ]);
    expect(layerOrder(preview)).toEqual(app);
  });

  it("puts the tokens in reset and the utilities in app", () => {
    // index.css unlayered would beat every layered component rule regardless
    // of specificity, which is the trap src/app-styles.css documents at
    // length. The same trap exists here.
    const found = imports(preview);
    expect(found).toContainEqual({ file: "../src/index.css", layer: "reset" });
    expect(found).toContainEqual({
      file: "../src/utilities.css",
      layer: "app",
    });
    for (const i of found) {
      expect(i.layer, `${i.file} is imported unlayered`).not.toBeNull();
    }
  });

  it("is the only stylesheet the preview pulls in", () => {
    // A second import in preview.jsx would bypass every check above.
    const jsx = stripComments(
      readFileSync(path.join(ROOT, ".storybook/preview.jsx"), "utf8"),
    );
    const css = [...jsx.matchAll(/import\s+"([^"]+\.css)"/g)].map((m) => m[1]);
    expect(css).toEqual(["./preview-styles.css"]);
  });

  it("keeps every component's CSS inside @layer components", () => {
    // The layer is what lets component rules beat App.css's bare-element
    // selectors without a specificity fight. One file that forgets the
    // wrapper loses to App.css in the app and wins in Storybook, which is the
    // exact discrepancy this architecture exists to prevent.
    const dir = path.join(ROOT, "src/components");
    const stray: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
      const css = readFileSync(path.join(dir, f), "utf8");
      if (!/@layer\s+components\s*\{/.test(css)) stray.push(f);
    }
    expect(stray, "component CSS must be wrapped in @layer components").toEqual(
      [],
    );
  });
});
