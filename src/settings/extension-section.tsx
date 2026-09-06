import { useTranslation } from "react-i18next";
import "./settings.css";

// Install surface for the browser extension.
//
// The extension has existed since #477/#478 — one-click save of the posting in
// the current tab, and autofill of an ATS application form from the profile —
// and nothing in the app mentioned it. Not Settings, not onboarding, nowhere.
// Its own README tells the reader to create an API key under
// Settings → Integrations, which is this page, and this page said nothing back.
//
// No download link, deliberately. The extension is loaded unpacked from the
// repository rather than published to a store, and a self-hoster's copy lives
// in their own checkout — a URL here would be right for exactly one person.
// The steps name the folder instead, which is true wherever it came from.
export function BrowserExtension() {
  const { t } = useTranslation();
  return (
    <div className="admin-invite">
      <h3>{t("extension.title")}</h3>
      <p className="muted small">{t("extension.hint")}</p>
      <ol className="extension-steps muted small">
        <li>{t("extension.step1")}</li>
        <li>{t("extension.step2")}</li>
        <li>{t("extension.step3")}</li>
      </ol>
      {/* The key it asks for is generated further down this same page, which
          is worth saying: the README sends people here for it. */}
      <p className="muted small">{t("extension.keyHint")}</p>
    </div>
  );
}
