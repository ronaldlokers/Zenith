// Settings sub-components extracted from App.tsx (#285 split). SettingsPage
// itself stays in App (it also renders FeedSettings, which would form a
// cycle); these are the self-contained leaf sections it composes.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { signOut, useSession } from "../auth-client";
import { requestConfirm } from "../hooks";
import {
  CV_LANG_KEY,
  getCvLanguage,
  KEY_SHORTCUTS_KEY,
  keyShortcutsEnabled,
} from "../format";
import type { RoleTypeDef } from "../types";
import { useLocation } from "react-router-dom";
import { ActionBar, Button } from "../components";
import { FeedSettings } from "../feed";
import { DeleteAccount, ChangePassword, TwoFactorSettings, SessionManagement, AnthropicKeySettings } from "./account";
import { AdminUsers, AdminInvite, TestPush } from "./admin";
import { SampleDataSettings } from "./data";
import { PublicApiSettings } from "./api";
import { PushSettings } from "./notifications";

const LANGUAGES: [string, string][] = [
  ["en", "languageEn"],
  ["nl", "languageNl"],
];


const THEME_KEY = "zenith_theme";
// Single-character shortcuts (n, /) must be switchable off for speech-input
// and single-switch users (WCAG 2.1.4). Modified chords like ⌘K are exempt
// and stay on regardless. Read live at keypress so the setting takes effect
// without a reload.
// Applies the persisted theme choice — called on initial load (see App())
// and whenever the Settings selector changes it.
function applyTheme(value: string) {
  // "auto" follows the OS via prefers-color-scheme (no attribute); "light"
  // and "dark" are explicit overrides that win regardless of the OS.
  if (value === "light" || value === "dark") {
    document.documentElement.dataset.theme = value;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

// Settings is a routed page with a section nav (#314) — it had grown to
// 14+ stacked sections (incl. an admin console) inside a 416px modal.
type SettingsSection =
  | "general"
  | "account"
  | "feed"
  | "sharing"
  | "integrations"
  | "data"
  | "admin";

const SETTINGS_SECTIONS: SettingsSection[] = [
  "general",
  "account",
  "feed",
  "sharing",
  "integrations",
  "data",
  "admin",
];

export function SettingsPage({
  roleTypes,
  onRoleTypesChanged,
  notify,
}: {
  roleTypes: RoleTypeDef[];
  onRoleTypesChanged: () => Promise<void>;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const location = useLocation();
  // Deep-linkable sections (#314): /settings?s=feed lands on Feed sources.
  const requested = new URLSearchParams(location.search).get("s");
  const [section, setSection] = useState<SettingsSection>(
    SETTINGS_SECTIONS.includes(requested as SettingsSection)
      ? (requested as SettingsSection)
      : "general",
  );
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("s");
    if (q && SETTINGS_SECTIONS.includes(q as SettingsSection)) {
      setSection(q as SettingsSection);
    }
  }, [location.search]);
  const [cvLang, setCvLang] = useState(() =>
    getCvLanguage(i18n.resolvedLanguage ?? "en"),
  );
  const [theme, setTheme] = useState(
    () => {
      const saved = localStorage.getItem(THEME_KEY);
      // control-room retired (#346) — its users were on a dark theme, so
      // fold them into explicit Dark.
      return saved === "control-room" ? "dark" : (saved ?? "auto");
    },
  );
  const [keyShortcuts, setKeyShortcuts] = useState(keyShortcutsEnabled);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    api.profile().then((p) => {
      setShareToken(p.share_token);
      setCalendarToken(p.calendar_token);
    });
  }, []);

  // Mirror the current UI language into the user row on load, so users who set
  // their language before it was persisted server-side get captured without
  // having to re-pick it. Fire-and-forget.
  useEffect(() => {
    void api.setLocale(i18n.resolvedLanguage === "nl" ? "nl" : "en").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareUrl = shareToken
    ? `${window.location.origin}/shared/${shareToken}`
    : null;

  const generateLink = async () => {
    // Regenerating breaks the link already shared with someone (#285).
    if (
      shareToken &&
      !(await requestConfirm(t("settings.regenerateLinkConfirm")))
    )
      return;
    setShareBusy(true);
    api
      .generateShareToken()
      .then((r) => setShareToken(r.share_token))
      .catch((e) => setApiError((e as Error).message))
      .finally(() => setShareBusy(false));
  };

  const disableLink = async () => {
    if (!(await requestConfirm(t("settings.disableLinkConfirm")))) return;
    setShareBusy(true);
    api
      .revokeShareToken()
      .then(() => setShareToken(null))
      .catch((e) => setApiError((e as Error).message))
      .finally(() => setShareBusy(false));
  };

  const calendarUrl = calendarToken
    ? `${window.location.origin}/calendar/${calendarToken}`
    : null;

  const generateCalendarLink = async () => {
    if (
      calendarToken &&
      !(await requestConfirm(t("settings.regenerateLinkConfirm")))
    )
      return;
    setCalendarBusy(true);
    api
      .generateCalendarToken()
      .then((r) => setCalendarToken(r.calendar_token))
      .catch((e) => setApiError((e as Error).message))
      .finally(() => setCalendarBusy(false));
  };

  const disableCalendarLink = async () => {
    if (!(await requestConfirm(t("settings.disableLinkConfirm")))) return;
    setCalendarBusy(true);
    api
      .revokeCalendarToken()
      .then(() => setCalendarToken(null))
      .catch((e) => setApiError((e as Error).message))
      .finally(() => setCalendarBusy(false));
  };

  const sections: SettingsSection[] = [
    "general",
    ...(session ? (["account"] as const) : []),
    "feed",
    "sharing",
    ...(session ? (["integrations", "data"] as const) : []),
    ...(session?.user.role === "admin" ? (["admin"] as const) : []),
  ];

  return (
    <section className="settings-page">
      <nav className="settings-nav" aria-label={t("settings.title")}>
        {sections.map((s) => (
          <button
            key={s}
            className={section === s ? "active" : ""}
            aria-current={section === s ? "true" : undefined}
            onClick={() => setSection(s)}
          >
            {t(`settings.section.${s}`)}
          </button>
        ))}
      </nav>
      <div className="settings-content settings-modal">
        <h2>{t(`settings.section.${section}`)}</h2>
        {apiError && <p className="login-error">{apiError}</p>}
        {section === "general" && (
          <>
        <div className="settings-fieldgrid">
        <label className="settings-field">
          <span>{t("settings.language")}</span>
          <select
            value={i18n.resolvedLanguage}
            onChange={(e) => {
              const lang = e.target.value;
              i18n.changeLanguage(lang);
              void api.setLocale(lang).catch(() => {});
            }}
          >
            {LANGUAGES.map(([code, labelKey]) => (
              <option key={code} value={code}>
                {t(`settings.${labelKey}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span>{t("settings.theme")}</span>
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              localStorage.setItem(THEME_KEY, e.target.value);
              applyTheme(e.target.value);
            }}
          >
            <option value="auto">{t("settings.themeAuto")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </label>
        <label className="settings-field">
          <span>{t("settings.cvLanguage")}</span>
          <select
            value={cvLang}
            onChange={(e) => {
              setCvLang(e.target.value);
              localStorage.setItem(CV_LANG_KEY, e.target.value);
            }}
          >
            {LANGUAGES.map(([code, labelKey]) => (
              <option key={code} value={code}>
                {t(`settings.${labelKey}`)}
              </option>
            ))}
          </select>
        </label>
        </div>
        <label className="settings-field settings-check">
          <input
            type="checkbox"
            checked={keyShortcuts}
            onChange={(e) => {
              setKeyShortcuts(e.target.checked);
              localStorage.setItem(
                KEY_SHORTCUTS_KEY,
                e.target.checked ? "on" : "off",
              );
            }}
          />
          <span>{t("settings.keyShortcuts")}</span>
        </label>
          </>
        )}
        {section === "feed" && (
          <FeedSettings
            roleTypes={roleTypes}
            onRoleTypesChanged={onRoleTypesChanged}
            onError={setApiError}
            notify={notify}
          />
        )}
        {section === "sharing" && (
          <>
        <div className="settings-field share-field">
          <span>{t("settings.shareLink")}</span>
          {shareUrl ? (
            <>
              <input readOnly value={shareUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
              <ActionBar variant="share">
                <Button disabled={shareBusy} variant="secondary" onClick={generateLink}>
                  {t("settings.regenerateLink")}
                </Button>
                <Button disabled={shareBusy} variant="danger" onClick={disableLink}>
                  {t("settings.disableLink")}
                </Button>
              </ActionBar>
            </>
          ) : (
            <Button
              variant="secondary"
              disabled={shareBusy}
              onClick={generateLink}
            >
              {t("settings.generateLink")}
            </Button>
          )}
        </div>
        <div className="settings-field share-field">
          <span>{t("settings.calendarLink")}</span>
          {calendarUrl ? (
            <>
              <input readOnly value={calendarUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
              <p className="muted small">{t("settings.calendarLinkHint")}</p>
              <ActionBar variant="share">
                <Button disabled={calendarBusy} variant="secondary" onClick={generateCalendarLink}>
                  {t("settings.regenerateLink")}
                </Button>
                <Button disabled={calendarBusy} variant="danger" onClick={disableCalendarLink}>
                  {t("settings.disableLink")}
                </Button>
              </ActionBar>
            </>
          ) : (
            <Button
              variant="secondary"
              disabled={calendarBusy}
              onClick={generateCalendarLink}
            >
              {t("settings.generateLink")}
            </Button>
          )}
        </div>
          </>
        )}
        {section === "account" && session && (
          <div className="account-section">
            <div className="account-signed-in">
              <span>
                {t("account.signedInAs", { email: session.user.email })}
              </span>
              <Button variant="secondary" onClick={() => signOut()}>
                {t("account.signOut")}
              </Button>
            </div>
            <ChangePassword />
            <TwoFactorSettings />
            <SessionManagement />
            <AnthropicKeySettings />
            <DeleteAccount onError={setApiError} />
          </div>
        )}
        {section === "integrations" && session && (
          <div className="account-section">
            <PublicApiSettings onError={setApiError} />
            <PushSettings />
          </div>
        )}
        {section === "data" && session && (
          <div className="account-section">
            <SampleDataSettings onError={setApiError} />
          </div>
        )}
        {section === "admin" && session?.user.role === "admin" && (
          <div className="account-section">
            <AdminUsers onError={setApiError} />
            <AdminInvite />
            <TestPush onError={setApiError} />
          </div>
        )}
      </div>
    </section>
  );
}
