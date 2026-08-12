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
  formatDate,
  getCvLanguage,
  KEY_SHORTCUTS_KEY,
  keyShortcutsEnabled,
} from "../format";
import type { RoleTypeDef } from "../types";
import { useLocation } from "react-router-dom";
import { ActionBar, Button, SettingsNav } from "../components";
import { FeedSettings } from "../feed";
import { TimezoneField } from "./timezone-field";
import { SettingsRow } from "./row";
import { DeleteAccount, ChangePassword, TwoFactorSettings, SessionManagement, AnthropicKeySettings } from "./account";
import { DataExport, SampleDataSettings } from "./data";
import { PublicApiSettings } from "./api";
import { NotificationSettings } from "./notifications";

const LANGUAGES: [string, string][] = [
  ["en", "languageEn"],
  ["nl", "languageNl"],
];


// Single-character shortcuts (n, /) must be switchable off for speech-input
// and single-switch users (WCAG 2.1.4). Modified chords like ⌘K are exempt
// and stay on regardless. Read live at keypress so the setting takes effect
// without a reload.
// Settings is a routed page with a section nav (#314) — it had grown to
// 14+ stacked sections (incl. an admin console) inside a 416px modal.
type SettingsSection =
  | "general"
  | "account"
  | "feed"
  | "sharing"
  | "integrations"
  | "data";

const SETTINGS_SECTIONS: SettingsSection[] = [
  "general",
  "account",
  "feed",
  "sharing",
  "integrations",
  "data",
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
  const [timezone, setTimezone] = useState<string>(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  useEffect(() => {
    void api
      .getPreferences()
      .then((p) => {
        if (p.timezone) {
          setTimezone(p.timezone);
          return;
        }
        // Server still holds NULL: useAppData's own detect-and-store attempt
        // fails silently by design, and a browser-resolved zone workerd's
        // ICU doesn't recognise would 400 forever there. Settings is about
        // to *display* the browser's zone regardless, so write that value
        // through here too — a visit to Settings repairs the server state
        // instead of only reflecting a selection that was never saved.
        const detected =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        void api.setTimezone(detected).catch(() => {});
      })
      .catch(() => {});
  }, []);
  const [keyShortcuts, setKeyShortcuts] = useState(keyShortcutsEnabled);
  const [weeklyGoal, setWeeklyGoal] = useState<number>(0);
  const [searchStart, setSearchStart] = useState<string>("");
  useEffect(() => {
    api.goals().then((g) => {
      setWeeklyGoal(g.weekly_app_goal);
      setSearchStart(g.search_started_at ?? "");
    });
  }, []);
  const saveGoals = (next: { weekly_app_goal?: number; search_started_at?: string | null }) =>
    api
      .setGoals({
        weekly_app_goal: next.weekly_app_goal ?? weeklyGoal,
        search_started_at:
          next.search_started_at !== undefined
            ? next.search_started_at
            : searchStart || null,
      })
      .catch((e) => setApiError((e as Error).message));
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
  ];

  return (
    <section className="settings-page">
      <SettingsNav
        sections={sections.map((s) => ({ key: s, label: t(`settings.section.${s}`) }))}
        active={section}
        onSelect={setSection}
        aria-label={t("settings.title")}
      />
      <div className="settings-content settings-modal">
        <h2>{t(`settings.section.${section}`)}</h2>
        {apiError && <p className="login-error">{apiError}</p>}
        {section === "general" && (
          <>
        {/* Stated values with the control behind each row (#535 mockup):
            settings are read far more often than they are changed, and a
            page of controls answers the wrong question. */}
        <div className="settings-rows">
        <SettingsRow
          label={t("settings.language")}
          value={t(
            `settings.${LANGUAGES.find(([c]) => c === i18n.resolvedLanguage)?.[1] ?? "langEnglish"}`,
          )}
        >
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
        </SettingsRow>
        <SettingsRow label={t("settings.timezone")} value={timezone}>
          <TimezoneField
            value={timezone}
            onChange={(next) => {
              // Update the surface first, then mirror it up — same shape as
              // the Language field. The select must not wait on the request.
              setTimezone(next);
              void api.setTimezone(next).catch(() => {});
            }}
          />
        </SettingsRow>
        <SettingsRow
          label={t("settings.cvLanguage")}
          value={t(
            `settings.${LANGUAGES.find(([c]) => c === cvLang)?.[1] ?? "langEnglish"}`,
          )}
        >
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
        </SettingsRow>
        <SettingsRow
          label={t("goals.weeklyGoalLabel")}
          value={t("goals.weeklyGoalValue", { count: weeklyGoal })}
        >
          <label className="settings-field">
            <span>{t("goals.weeklyGoalLabel")}</span>
            <input
              type="number"
              min={0}
              max={50}
              value={weeklyGoal}
              onChange={(e) => {
                const v = Math.max(0, Math.min(50, Number(e.target.value) || 0));
                setWeeklyGoal(v);
                void saveGoals({ weekly_app_goal: v });
              }}
            />
          </label>
        </SettingsRow>
        <SettingsRow
          label={t("goals.searchStartLabel")}
          value={searchStart ? formatDate(searchStart) : t("settings.notSet")}
        >
          <label className="settings-field">
            <span>{t("goals.searchStartLabel")}</span>
            <input
              type="date"
              value={searchStart}
              onChange={(e) => {
                setSearchStart(e.target.value);
                void saveGoals({ search_started_at: e.target.value || null });
              }}
            />
          </label>
        </SettingsRow>
        {/* A switch states its own value, so it sits on the row rather than
            behind it — the same shape the mockup gives its notification
            toggles. */}
        <label className="set-row set-row-toggle">
          <span className="set-row-label">{t("settings.keyShortcuts")}</span>
          <span className="set-row-leader" aria-hidden="true" />
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
        </label>
        </div>
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
              <p className="settings-warning small">
                {t("settings.calendarPrivacyWarning")}
              </p>
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
            <NotificationSettings />
          </div>
        )}
        {section === "data" && session && (
          <div className="account-section">
            <DataExport />
            <SampleDataSettings onError={setApiError} />
          </div>
        )}
      </div>
    </section>
  );
}
