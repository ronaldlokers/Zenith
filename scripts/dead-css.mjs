// Reports App.css rule blocks whose selector mentions only classes that no
// file under src/, worker/ or index.html references.
//
// Template-built class names are invisible to this scan — `stage-${status}`,
// `u-${urgency}` and `mock-${role}` all read as unreferenced and are all live.
//
// A block's selector is captured from only the source line bearing `{`
// (`sel: lines[i].trim()`), so a multi-line comma-separated selector group
// is invisible above that last line — a rule like `.form input,\n.settings-
// field input,\n.tag-chip {` reports as fully dead ("cls" only ever sees
// ".tag-chip") even when every other selector in the group is live. Deleting
// that reported range deletes the shared declaration for the live selectors
// too. Check every candidate for a preceding comma-terminated line before
// deleting it.
//
// The DEAD list this produces is a candidate list, never a delete list.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const walk = (d) => readdirSync(d).flatMap((e) => {
  const f = path.join(d, e);
  try { return statSync(f).isDirectory() ? walk(f) : [f]; } catch { return []; }
});
const haystack = [...walk("src"), ...walk("worker"), "index.html"]
  .filter((f) => /\.(tsx?|jsx?|html|json)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const css = readFileSync("src/App.css", "utf8");
const classes = [...new Set([...css.matchAll(/^\s*\.([a-zA-Z][\w-]*)/gm)].map((m) => m[1]))];
const dead = new Set(classes.filter((c) => !haystack.includes(c)));

const lines = css.split("\n");
const stack = [];
let total = 0;
for (let i = 0; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === "{") stack.push({ start: i, sel: lines[i].trim(), at: lines[i].trim().startsWith("@") });
    else if (ch === "}") {
      const b = stack.pop();
      if (!b || b.at) continue;
      const cls = [...b.sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
      if (cls.length && cls.every((c) => dead.has(c))) {
        total += i - b.start + 1;
        console.log(`${b.start + 1}-${i + 1}  ${b.sel}`);
      }
    }
  }
}
console.log(`\n${total} lines`);
