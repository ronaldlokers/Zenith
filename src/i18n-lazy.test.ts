import { beforeEach, describe, expect, test, vi } from "vitest";

// Only English ships in the entry; every other locale is a chunk of its own.
// The document language has to survive that, and on a first load it nearly
// did not: nothing calls changeLanguage when the language comes from
// localStorage or the browser, so the languageChanged listener never fires,
// and resolvedLanguage still answers "en" while the resources are in flight.
// Measured in the browser: a Dutch page rendering Dutch copy under
// <html lang="en">, which is what a screen reader picks its voice from.
//
// Its own file because i18n.ts initializes once on import — reproducing a
// first load means resetting the module registry and importing it again with
// the language already chosen.
describe("a locale that has to be fetched", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.setItem("zenith_lang", "nl");
    document.documentElement.lang = "en";
  });

  test("sets the document language on a first load, with no language change", async () => {
    const mod = await import("./i18n");
    await mod.i18nReady;

    expect(
      mod.default.hasResourceBundle("nl", "translation"),
      "the Dutch chunk never arrived",
    ).toBe(true);
    expect(document.documentElement.lang).toBe("nl");
  });

  test("renders that locale's copy rather than the fallback", async () => {
    // The other half of the same promise: the app is awaited on i18nReady
    // before its first render, so the first paint is already translated.
    const mod = await import("./i18n");
    await mod.i18nReady;
    expect(mod.default.t("tabs.pipeline")).toBe("Pijplijn");
  });
});
