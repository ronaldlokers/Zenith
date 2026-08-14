import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "nl"],
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "zenith_lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    // A locale that arrives after the language has already changed still has
    // to reach the screen. Without this, react-i18next re-renders on
    // languageChanged only, and the switch to a lazily loaded language
    // repainted with the fallback copy.
    react: { bindI18nStore: "added" },
  });

// Only English is bundled with the app. It is the fallback, so it has to be
// there before the first render; every other locale is fetched when it is the
// one actually being read.
//
// Both were compiled into the entry chunk, so every visitor downloaded every
// translation of every string and used one set: nl alone was 14.56 kB gzipped
// of a 68.97 kB entry, and the two together were 40% of it. More locales are
// planned, which is what makes this the difference between an entry that
// grows with each language added and one that does not.
//
// An explicit map rather than a computed import path: a template literal
// makes the bundler emit a chunk for every JSON file in the directory,
// including the English one already inlined here. Adding a locale is one
// line, next to the line that declares it supported.
const LOADERS: Record<string, () => Promise<{ default: object }>> = {
  nl: () => import("./locales/nl.json"),
};

// Keep the document language in step with the UI language. It was hardcoded
// to "en" in index.html, so a Dutch page announced itself as English — which
// is what a screen reader picks its voice from, and what the browser
// hyphenates and spellchecks by.
function syncDocumentLang(lng: string) {
  document.documentElement.lang = lng;
}

async function loadLocale(lng: string | undefined): Promise<void> {
  // "nl-BE" and "nl" read the same file.
  const base = (lng ?? "en").split("-")[0];
  const load = LOADERS[base];
  if (!load || i18n.hasResourceBundle(base, "translation")) return;
  try {
    i18n.addResourceBundle(base, "translation", (await load()).default, true, true);
    // The language we just loaded, not resolvedLanguage: that is computed
    // when the language is set and is not recomputed when resources arrive,
    // so it still answers "en" here. Adding resources raises no
    // languageChanged either — the language never changed, only what is
    // known about it. Without this line a lazily loaded locale leaves
    // <html lang="en"> on a page that is not in English, which is the bug
    // the sync above was written for.
    syncDocumentLang(base);
  } catch {
    // Left on the fallback rather than blank: a locale that will not load is
    // a worse page in English, not no page at all.
  }
}

syncDocumentLang(i18n.resolvedLanguage ?? "en");
i18n.on("languageChanged", syncDocumentLang);

// Awaited before the first render (main.tsx), so a Dutch visitor does not get
// a frame of English before their own copy lands. Resolves immediately for
// English, which is the common case.
export const i18nReady = loadLocale(i18n.language);
i18n.on("languageChanged", (lng: string) => {
  void loadLocale(lng);
});

export default i18n;
