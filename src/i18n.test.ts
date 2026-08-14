import { describe, expect, test } from "vitest";
import i18n from "./i18n";

// The document language was hardcoded to "en" in index.html and never
// followed the UI. That is what a screen reader picks its voice from, and
// what the browser hyphenates and spellchecks by — so a Dutch page was being
// read aloud in English.
describe("document language", () => {
  test("follows the UI language", async () => {
    await i18n.changeLanguage("nl");
    expect(document.documentElement.lang).toBe("nl");
    await i18n.changeLanguage("en");
    expect(document.documentElement.lang).toBe("en");
  });

});
