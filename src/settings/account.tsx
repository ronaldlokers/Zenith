import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { authClient, signOut, useSession } from "../auth-client";
import { requestConfirm } from "../hooks";
import { formatDate } from "../format";

export function DeleteAccount({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!(await requestConfirm(t("account.deleteConfirm")))) return;
    setBusy(true);
    try {
      await api.deleteAccount();
      await signOut();
      window.location.reload();
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="admin-invite">
      <h3>{t("account.deleteAccount")}</h3>
      <p className="muted small">{t("account.deleteHint")}</p>
      <button className="danger" disabled={busy} onClick={del}>
        {t("account.deleteAccount")}
      </button>
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
          <button
            type="button"
            className="btn-secondary"
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
          </button>
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
          <button type="submit" disabled={busy} className={enabled ? "danger" : ""}>
            {enabled ? t("account.twoFactorDisable") : t("account.twoFactorEnable")}
          </button>
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
                {s.ipAddress ?? "—"} · {formatDate(String(s.createdAt))}
                {s.token === currentToken ? ` · ${t("account.thisDevice")}` : ""}
              </span>
            </span>
            {s.token !== currentToken && (
              <button
                className="danger"
                disabled={busyToken === s.token}
                onClick={() => revoke(s.token)}
              >
                {t("account.revoke")}
              </button>
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
