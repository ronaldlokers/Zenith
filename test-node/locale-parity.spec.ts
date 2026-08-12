import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Strict en/nl key parity is a standing rule, and until now it was only ever
// checked by hand. A missing key does not throw — i18next falls back to the
// key itself — so the failure ships as a screen with "board.addHere" printed
// on it, in one language, for whoever happens to use that language. More
// locales are planned, so this asserts over whatever locale files exist
// rather than over a hardcoded pair.
const LOCALES = ["en", "nl"] as const;

type Json = { [k: string]: Json | string | undefined };

// Every source file the app ships, so a key added in one and never defined
// is caught wherever it lives.
function sourceFiles(dir = new URL("../src", import.meta.url).pathname): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function load(locale: string): Json {
  return JSON.parse(
    readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), "utf8"),
  ) as Json;
}

function keys(obj: Json, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    out.push(prefix + k);
    if (v && typeof v === "object") out.push(...keys(v as Json, `${prefix}${k}.`));
  }
  return out;
}

describe("locale parity", () => {
  const byLocale = new Map(LOCALES.map((l) => [l, keys(load(l)).sort()]));
  const [base, ...rest] = LOCALES;

  for (const other of rest) {
    it(`${other} has every key ${base} has, and no others`, () => {
      const a = new Set(byLocale.get(base)!);
      const b = new Set(byLocale.get(other)!);
      const missing = [...a].filter((k) => !b.has(k));
      const extra = [...b].filter((k) => !a.has(k));
      expect(missing, `missing from ${other}`).toEqual([]);
      expect(extra, `only in ${other}`).toEqual([]);
    });
  }

  it("has no empty strings standing in for a translation", () => {
    // An empty value passes a key-parity check and still renders nothing.
    for (const locale of LOCALES) {
      const flat = (obj: Json, prefix = ""): [string, string][] =>
        Object.entries(obj).flatMap(([k, v]) =>
          v && typeof v === "object"
            ? flat(v as Json, `${prefix}${k}.`)
            : [[prefix + k, String(v)] as [string, string]],
        );
      const blank = flat(load(locale)).filter(([, v]) => v.trim() === "");
      expect(blank.map(([k]) => k), `blank in ${locale}`).toEqual([]);
    }
  });

  it("keeps interpolation placeholders identical across locales", () => {
    // A translation that drops {{count}} loses the number silently — the
    // sentence still reads, just without the fact in it.
    const placeholders = (s: string) =>
      [...s.matchAll(/\{\{(\w+)/g)].map((m) => m[1]).sort();
    const flat = (obj: Json, prefix = ""): Record<string, string> =>
      Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
        if (v && typeof v === "object") Object.assign(acc, flat(v as Json, `${prefix}${k}.`));
        else acc[prefix + k] = String(v);
        return acc;
      }, {});
    const baseFlat = flat(load(base));
    for (const other of rest) {
      const otherFlat = flat(load(other));
      for (const [key, value] of Object.entries(baseFlat)) {
        const want = placeholders(value);
        if (!want.length) continue;
        expect(placeholders(otherFlat[key] ?? ""), `${other}: ${key}`).toEqual(want);
      }
    }
  });

  it("defines every key the app asks for by name", () => {
    // Parity says en and nl agree; it says nothing about whether either
    // matches the app. A typo'd key does not throw — i18next renders the key
    // itself, so "detail.cheatSheat.print" ships as that string on a button.
    const base = load("en");
    const has = (key: string) => {
      let cur: Json | string | undefined = base;
      for (const part of key.split(".")) {
        if (!cur || typeof cur !== "object") return false;
        cur = (cur as Json)[part];
      }
      return cur !== undefined;
    };
    const missing = new Map<string, string>();
    for (const file of sourceFiles()) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
        const key = m[1];
        // Plurals are stored as key_one / key_other.
        if (has(key) || has(`${key}_one`) || has(`${key}_other`)) continue;
        missing.set(key, file);
      }
    }
    expect(
      [...missing].map(([k, f]) => `${k} (${f})`),
      "these render as the key itself",
    ).toEqual([]);
  });
});
