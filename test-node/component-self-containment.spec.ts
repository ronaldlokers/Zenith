import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// A component that borrows a class from App.css renders differently in
// Storybook (which loads no App.css) than in the app — the catalog then
// misrepresents what ships, which is the whole reason components under
// src/components/ are self-contained (see that directory's header comment
// in index.ts). Six components did exactly that before Wave 2, one of them
// with a comment arguing the borrow was correct, so this is a test rather
// than a convention — same argument no-claude-imports.spec.ts makes for a
// different boundary, and the precedent for this file's structure.
//
// Scope: src/components/*.tsx only. Files elsewhere that also import their
// own CSS (src/timeline.tsx, src/board.tsx, …) are extracted-but-not-yet-
// owned and still lean on App.css by design — out of scope until they move
// into src/components/.
const DIR = "src/components";

// The three text primitives Task 11 pulled out of App.css into a stylesheet
// both the app and Storybook load — src/utilities.css's own header explains
// why these three and no more.
const UTILITIES = new Set(["muted", "small", "sr-only"]);

// ---- comment stripping --------------------------------------------------
//
// Every scan below runs on comment-stripped source. Skipping this once
// would have been a real false failure: Button.tsx has a comment reading
// "...space the `icon` prop from the label..." — the two backticks around
// `icon` read exactly like a one-word template literal to a naive scanner,
// which would queue "icon" as a used class with no definition anywhere and
// fail the test for a reason that has nothing to do with self-containment.
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out += src[i];
          i++;
        }
        out += src[i] ?? "";
        i++;
      }
      out += src[i] ?? "";
      i++;
      continue;
    }
    if (c === "`") {
      out += c;
      i++;
      let depth = 0;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (src[i] === "`" && depth === 0) {
          out += src[i];
          i++;
          break;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          depth++;
          out += "${";
          i += 2;
          continue;
        }
        if (src[i] === "}" && depth > 0) {
          depth--;
          out += "}";
          i++;
          continue;
        }
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// ---- CSS side: which classes a stylesheet defines ------------------------

export function classesIn(css: string): Set<string> {
  // Matches a class token wherever it appears in a selector, including
  // inside a compound (`.a.b`) or descendant (`.a > button.b`) selector —
  // the class counts as defined even though no rule targets it standalone
  // (Documents.css's `.zui-btn.zui-btn--danger.tl-del` is exactly this).
  return new Set(
    [...stripComments(css).matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
  );
}

function definedFor(tsxPath: string, rawSrc: string): Set<string> {
  const defined = new Set(UTILITIES);
  // Every stylesheet the component imports, not just one matching its own
  // name — a shared sheet like AiTranscript.css (MockInterview.tsx and
  // NegotiationRoleplay.tsx both import it instead of owning one) counts,
  // because Storybook loads it through the same import statement.
  for (const m of rawSrc.matchAll(/import\s+["'](\.\/[^"']+\.css)["']/g)) {
    const cssPath = path.join(path.dirname(tsxPath), m[1]);
    for (const c of classesIn(readFileSync(cssPath, "utf8"))) defined.add(c);
  }
  return defined;
}

// ---- TSX side: which classes a component's markup uses -------------------

// Scans forward from an opening bracket and returns the balanced content
// inside it, treating quoted and template-literal spans as atomic so a
// stray `}`/`]` inside a string (or inside a `${…}`'s own braces) doesn't
// close the expression early.
function balancedContent(
  src: string,
  openIdx: number,
  openCh: string,
  closeCh: string,
): string {
  let i = openIdx + 1;
  const start = i;
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "`") {
      i++;
      let tdepth = 0;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "`" && tdepth === 0) {
          i++;
          break;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          tdepth++;
          i += 2;
          continue;
        }
        if (src[i] === "}" && tdepth > 0) {
          tdepth--;
          i++;
          continue;
        }
        i++;
      }
      continue;
    }
    if (c === openCh) {
      depth++;
      i++;
      continue;
    }
    if (c === closeCh) {
      depth--;
      if (depth === 0) break;
      i++;
      continue;
    }
    i++;
  }
  return src.slice(start, i);
}

// A whitespace-delimited token that contains this sentinel came from a
// `${…}` interpolation, either wholly or by concatenation (`kind-${e.kind}`,
// `zui-transcript-msg--${role}`), and gets dropped whole rather than
// checked as the literal string "kind-" or "zui-transcript-msg--" — neither
// of those is a real class name, and checking them would fail the test for
// the wrong reason. A token with no sentinel — space-separated from any
// interpolation, e.g. the "zui-transcript-msg" half of
// `` `zui-transcript-msg zui-transcript-msg--${role}` `` — is a real static
// class and is still checked. This is a deliberate under-check: a prefix
// glued directly to an interpolation (CalendarMonth's
// `` `zui-cal-day${cond ? "" : " out"}` ``) is dropped in full rather than
// verifying just the "zui-cal-day" part, because nothing in the syntax
// guarantees the interpolation starts with a space.
const DYNAMIC = "\u0000";

export function classTokens(exprText: string): string[] {
  let flat = "";
  let i = 0;
  while (i < exprText.length) {
    if (exprText[i] === "$" && exprText[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < exprText.length && depth > 0) {
        if (exprText[i] === "{") depth++;
        else if (exprText[i] === "}") depth--;
        i++;
      }
      flat += DYNAMIC;
      continue;
    }
    flat += exprText[i];
    i++;
  }
  const tokens: string[] = [];
  for (const m of flat.matchAll(/`([^`]*)`|"([^"]*)"|'([^']*)'/g)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    tokens.push(...literal.split(/\s+/).filter(Boolean));
  }
  return tokens.filter((t) => !t.includes(DYNAMIC));
}

// Resolves `className={ident}` back to a `const ident = [...]` array
// literal declared earlier in the same file — the pattern Button.tsx,
// Row.tsx, Avatar.tsx and over a dozen others use:
// `["zui-x", cond ? "zui-x--y" : null, className].filter(Boolean).join(" ")`.
// Anything else a variable could hold (a ternary assigned directly, a
// helper function's return value) isn't resolved and is silently skipped —
// a real but narrow gap, in keeping with this test's rule of skipping what
// it cannot prove rather than guessing.
function resolveIdentifier(src: string, ident: string): string[] {
  const decl = new RegExp(`\\bconst\\s+${ident}\\s*=\\s*\\[`).exec(src);
  if (!decl) return [];
  const openIdx = decl.index + decl[0].length - 1;
  return classTokens(balancedContent(src, openIdx, "[", "]"));
}

export function usedIn(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const used: string[] = [];
  const CLASSNAME_RE = /className=(\{|")/g;
  let m: RegExpExecArray | null;
  while ((m = CLASSNAME_RE.exec(src))) {
    if (m[1] === '"') {
      const end = src.indexOf('"', m.index + m[0].length);
      used.push(
        ...src
          .slice(m.index + m[0].length, end)
          .split(/\s+/)
          .filter(Boolean),
      );
      continue;
    }
    const openIdx = m.index + m[0].length - 1;
    const expr = balancedContent(src, openIdx, "{", "}");
    const trimmed = expr.trim();
    // A bare identifier — className={classes} — has no quotes to extract
    // directly; resolve it back to its array-literal declaration instead.
    if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
      used.push(...resolveIdentifier(src, trimmed));
    } else {
      used.push(...classTokens(expr));
    }
  }
  return used;
}

const components = readdirSync(DIR).filter(
  (f) =>
    f.endsWith(".tsx") && !f.endsWith(".test.tsx") && !f.endsWith(".stories.tsx"),
);

describe("owned components are self-contained", () => {
  test.each(components)("%s uses no class it does not define", (file) => {
    const full = path.join(DIR, file);
    const rawSrc = readFileSync(full, "utf8");
    const defined = definedFor(full, rawSrc);
    const orphans = [...new Set(usedIn(rawSrc))].filter((c) => !defined.has(c));
    expect(orphans).toEqual([]);
  });
});

describe("classTokens", () => {
  test("keeps a static token, drops one glued to an interpolation", () => {
    expect(
      classTokens("`zui-transcript-msg zui-transcript-msg--${role}`"),
    ).toEqual(["zui-transcript-msg"]);
  });

  test("reads string elements out of an array/ternary literal", () => {
    expect(
      classTokens(
        '"zui-chip", matched ? "zui-chip--matched" : null, className',
      ),
    ).toEqual(["zui-chip", "zui-chip--matched"]);
  });

  test("drops a prefix glued directly to an interpolation", () => {
    // No space between the static text and `${…}` — CalendarMonth's
    // `zui-cal-day${cond ? "" : " out"}` shape. Nothing in the syntax says
    // the interpolation starts with a space, so the whole token is dropped
    // rather than checking a "zui-cal-day" that might not stand alone.
    expect(classTokens("`kind-${e.kind}`")).toEqual([]);
  });
});

describe("usedIn", () => {
  test("reads a plain className string", () => {
    expect(usedIn('<div className="a b">')).toEqual(["a", "b"]);
  });

  test("reads both branches of a ternary", () => {
    expect(usedIn('<li className={cond ? "danger" : ""}>')).toEqual([
      "danger",
    ]);
  });

  test("resolves className={ident} back to its array declaration", () => {
    const src = `
      const classes = ["zui-row", className].filter(Boolean).join(" ");
      return <li className={classes}>{children}</li>;
    `;
    expect(usedIn(src)).toEqual(["zui-row"]);
  });

  test("does not mistake a comment's backticks for a template literal", () => {
    const src = `
      // space the \`icon\` prop from the label
      return <button className="zui-btn">{children}</button>;
    `;
    expect(usedIn(src)).toEqual(["zui-btn"]);
  });
});

describe("classesIn", () => {
  test("counts a class inside a compound selector as defined", () => {
    expect(classesIn(".zui-btn.zui-btn--danger.tl-del { color: red; }")).toEqual(
      new Set(["zui-btn", "zui-btn--danger", "tl-del"]),
    );
  });
});
