import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { useAiStatus } from "../ai-status-context";
import { authClient, signOut, useSession } from "../auth-client";
import { ActionBar, Button } from "../components";
import { Dialog } from "../ui";
import { formatDateWithYear } from "../format";
import "./settings.css";

export function DeleteAccount({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  // A typed confirmation rather than the shared OK/Cancel. This is the only
  // action in the app that destroys everything — every application,
  // document, contact and CV — and an OK button is dismissed by the same
  // reflex that dismisses every other OK button. The established pattern for
  // an action that takes resources beyond the thing named on the button is
  // to make the user type its identifier, which cannot be done by reflex.
  //
  // The account's own email is the identifier: it is the one string a person
  // deleting their account certainly knows, and it is already on this page.
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const email = session?.user?.email ?? "";
  const matches =
    email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase();

  const del = async () => {
    if (!matches) return;
    setBusy(true);
    try {
      await api.deleteAccount();
      await signOut();
      window.location.reload();
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    /* A danger zone, which is the established shape for this: the one
       irreversible action on the page, grouped and bordered so it cannot be
       mistaken for the settings around it. It used to be a card identical to
       Change password and 2FA, carrying a 112x27px raw-widget button — the
       lightest control on the screen performing the heaviest act, while
       "Remove key" beside it was 471px wide. Weight now matches
       consequence. */
    <div className="settings-danger">
      <h3>{t("account.deleteAccount")}</h3>
      <p className="muted small">{t("account.deleteHint")}</p>
      <Button variant="danger" disabled={busy} onClick={() => setConfirming(true)}>
        {t("account.deleteAccount")}
      </Button>
      {confirming && (
        <Dialog
          label={t("account.deleteAccount")}
          onClose={() => {
            setConfirming(false);
            setTyped("");
          }}
        >
          <h3>{t("account.deleteAccount")}</h3>
          <p className="small">{t("account.deleteHint")}</p>
          {/* The way out that is not deletion. Offering the export here is
              the point at which someone realises they wanted their data,
              not the settings section they would have to go find. */}
          <p className="muted small">{t("account.deleteExportFirst")}</p>
          <label className="settings-field">
            <span>{t("account.deleteTypeEmail", { email })}</span>
            <input
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          <ActionBar variant="form">
            <Button variant="danger" disabled={!matches || busy} onClick={del}>
              {t("account.deleteForever")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </ActionBar>
        </Dialog>
      )}
    </div>
  );
}

// Self-serve change-password (#285) — closes the "invited users are stuck
// on the admin's temporary password, with no way to change it" gap.
export function ChangePassword() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: t("account.changePasswordError") });
      return;
    }
    setMsg({ ok: true, text: t("account.changePasswordSuccess") });
    setCurrent("");
    setNext("");
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.changePassword")}</h3>
      <form onSubmit={submit}>
        <label className="settings-field">
          <span>{t("account.currentPassword")}</span>
          <input
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>{t("account.newPassword")}</span>
          <input
            type="password"
            required
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        {msg && (
          <p className={msg.ok ? "admin-invite-success" : "login-error"}>
            {msg.text}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {t("account.changePasswordSubmit")}
        </button>
      </form>
    </div>
  );
}

// TOTP-based 2FA setup (#211) — no QR image (no new dependency for
// one settings field); the otpauth:// URI and its embedded secret are
// both shown so any authenticator app can add it, by scan-free manual
// entry if needed. Enabling immediately turns 2FA on server-side; the
// code-verify step here is just a "does this actually work" check.
export function TwoFactorSettings() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const enabled = !!(session?.user as { twoFactorEnabled?: boolean } | undefined)
    ?.twoFactorEnabled;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(
    null,
  );
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const enable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: enableError } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (enableError || !data) {
      setError(t("account.twoFactorError"));
      return;
    }
    setSetup(data);
    setPassword("");
  };

  const disable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: disableError } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (disableError) {
      setError(t("account.twoFactorError"));
      return;
    }
    setPassword("");
    setSetup(null);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({
      code: verifyCode,
    });
    setBusy(false);
    setVerifyMessage(
      verifyError ? t("account.twoFactorVerifyError") : t("account.twoFactorVerified"),
    );
  };

  const secret = setup ? new URL(setup.totpURI).searchParams.get("secret") : null;

  return (
    <div className="admin-invite">
      <h3>{t("account.twoFactor")}</h3>
      {setup ? (
        <>
          <p className="muted small">{t("account.twoFactorScanHint")}</p>
          <p className="tfa-secret">{secret}</p>
          <p className="muted small">{t("account.twoFactorBackupCodesHint")}</p>
          <ul className="tfa-backup-codes">
            {setup.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              // Backup codes are shown once (#285) — let the user save them.
              const blob = new Blob(
                [setup.backupCodes.join("\n") + "\n"],
                { type: "text/plain" },
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "zenith-backup-codes.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t("account.twoFactorDownloadCodes")}
          </Button>
          <form onSubmit={verify} className="tfa-verify">
            <input
              placeholder={t("account.twoFactorCodePlaceholder")}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              {t("login.verify")}
            </button>
          </form>
          {verifyMessage && <p className="muted small">{verifyMessage}</p>}
          <button onClick={() => setSetup(null)}>{t("common.close")}</button>
        </>
      ) : (
        <form onSubmit={enabled ? disable : enable}>
          <p className="muted small">
            {enabled ? t("account.twoFactorEnabledHint") : t("account.twoFactorDisabledHint")}
          </p>
          <label className="settings-field">
            <span>{t("login.password")}</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <Button
            type="submit"
            disabled={busy}
            variant={enabled ? "danger" : "default"}
              >
            {enabled ? t("account.twoFactorDisable") : t("account.twoFactorEnable")}
          </Button>
        </form>
      )}
    </div>
  );
}

// Active session list + revoke (#212) — Better-Auth's core session
// endpoints (list/revoke/revoke-other), not a plugin, so no schema
// change needed. currentToken comes from useSession() so the current
// device's row can be marked and can't accidentally revoke itself via
// the "sign out other devices" bulk action.
export function SessionManagement() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [sessions, setSessions] = useState<
    { token: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string | Date }[]
    | null
  >(null);
  const [busyToken, setBusyToken] = useState<string | null>(null);

  const load = () => {
    authClient.listSessions().then(({ data }) => {
      if (data) setSessions(data);
    });
  };

  useEffect(load, []);

  const revoke = async (token: string) => {
    setBusyToken(token);
    await authClient.revokeSession({ token });
    setBusyToken(null);
    load();
  };

  const revokeOthers = async () => {
    setBusyToken("__others__");
    await authClient.revokeOtherSessions();
    setBusyToken(null);
    load();
  };

  if (!sessions) return null;

  const currentToken = session?.session.token;

  return (
    <div className="admin-invite">
      <h3>{t("account.sessions")}</h3>
      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.token} className={s.token === currentToken ? "current" : ""}>
            <span className="session-info">
              <span>{s.userAgent ?? t("account.unknownDevice")}</span>
              <span className="muted small">
                {s.ipAddress ?? "—"} ·{" "}
                {/* Better Auth hands back a Date, and String(date) is
                    "Wed Aug 13 2026 ..." — formatDate slices the first ten
                    characters and appends T00:00:00, which parsed to
                    Invalid Date and printed it. Normalise to ISO first. A
                    session's age is also the one date here where the year
                    matters, so it keeps it. */}
                {formatDateWithYear(new Date(s.createdAt).toISOString())}
                {s.token === currentToken ? ` · ${t("account.thisDevice")}` : ""}
              </span>
            </span>
            {s.token !== currentToken && (
              <Button
                variant="danger"
                        disabled={busyToken === s.token}
                onClick={() => revoke(s.token)}
              >
                {t("account.revoke")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <button disabled={busyToken === "__others__"} onClick={revokeOthers}>
          {t("account.revokeOthers")}
        </button>
      )}
    </div>
  );
}

// BYO Claude key — store your own Anthropic API key (encrypted server-side) to
// enable the AI features. The key is write-only: the server returns only
// whether one is set plus a last-4 hint, never the key itself.
export function AnthropicKeySettings() {
  const { t } = useTranslation();
  // Single source of truth shared with every AI panel's key gate — so saving
  // or removing a key here flips those panels live (#443).
  const { configured, hint, refresh } = useAiStatus();
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.setAiKey(apiKey.trim());
      setApiKey("");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAiKey();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.aiKeyTitle")}</h3>
      <p className="muted small">{t("account.aiKeyHint")}</p>
      <ul className="ai-feature-list muted small">
        <li>{t("account.aiFeatureTailor")}</li>
        <li>{t("account.aiFeatureInterview")}</li>
        <li>{t("account.aiFeatureNegotiation")}</li>
      </ul>
      {error && <p className="login-error">{error}</p>}
      {configured ? (
        <div className="settings-fieldgrid">
          <span className="muted small">
            {t("account.aiKeyConnected", { hint })}
          </span>
          <Button
            variant="danger"
                disabled={busy}
            onClick={remove}
          >
            {t("account.aiKeyRemove")}
          </Button>
        </div>
      ) : (
        <form onSubmit={save}>
          <label className="settings-field">
            <span>{t("account.aiKeyLabel")}</span>
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !apiKey.trim()}>
            {busy ? t("account.aiKeySaving") : t("account.aiKeySave")}
          </button>
        </form>
      )}
    </div>
  );
}
