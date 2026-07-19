import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { authClient, signIn } from "./auth-client";

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Second step of a 2FA-enabled login (#211) — signIn.email() returns
  // twoFactorRedirect instead of a session when the account has TOTP
  // enabled; this app has no separate hosted auth page to redirect to,
  // so the same form swaps to a code prompt in place.
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: signInError } = await signIn.email({ email, password });
    setBusy(false);
    if (signInError) {
      setError(t("login.error"));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setNeedsTwoFactor(true);
    }
    // Otherwise better-auth's useSession hook (subscribed in App) picks
    // up the new session automatically — no manual reload/redirect needed.
  };

  const submitTwoFactor = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: verifyError } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (verifyError) {
      setError(t("login.twoFactorError"));
    }
  };

  if (needsTwoFactor) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={submitTwoFactor}>
          <h1>Zenith</h1>
          <p className="login-subtitle">
            {useBackupCode ? t("login.enterBackupCode") : t("login.enterTwoFactorCode")}
          </p>
          <label className="settings-field">
            <span>{useBackupCode ? t("login.backupCode") : t("login.twoFactorCode")}</span>
            <input
              type="text"
              inputMode={useBackupCode ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? t("login.signingIn") : t("login.verify")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setUseBackupCode((v) => !v);
              setCode("");
              setError(null);
            }}
          >
            {useBackupCode ? t("login.useTwoFactorCode") : t("login.useBackupCode")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>Zenith</h1>
        <p className="login-subtitle">{t("login.subtitle")}</p>
        <label className="settings-field">
          <span>{t("login.email")}</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>{t("login.password")}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? t("login.signingIn") : t("login.signIn")}
        </button>
        <p className="login-hint">{t("login.inviteOnly")}</p>
      </form>
    </div>
  );
}
