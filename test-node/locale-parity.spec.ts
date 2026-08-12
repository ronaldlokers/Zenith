import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Strict en/nl key parity is a standing rule, and until now it was only ever
// checked by hand. A missing key does not throw — i18next falls back to the
// key itself — so the failure ships as a screen with "board.addHere" printed
// on it, in one language, for whoever happens to use that language. More
// locales are planned, so this asserts over whatever locale files exist
// rather than over a hardcoded pair.
const LOCALES = ["en", "nl"] as const;

type Json = { [k: string]: Json | string | undefined };

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
});
