import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import nl from "./locales/nl.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      nl: { translation: nl },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "nl"],
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "zenith_lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

// Keep the document language in step with the UI language. It was hardcoded
// to "en" in index.html, so a Dutch page announced itself as English — which
// is what a screen reader picks its voice from, and what the browser
// hyphenates and spellchecks by.
function syncDocumentLang(lng: string) {
  document.documentElement.lang = lng;
}
syncDocumentLang(i18n.resolvedLanguage ?? "en");
i18n.on("languageChanged", syncDocumentLang);

export default i18n;
