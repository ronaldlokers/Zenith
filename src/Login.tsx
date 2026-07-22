import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { authClient, signIn } from "./auth-client";
import { Logo } from "./icons";

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Second step of a 2FA-enabled login (#211) — signIn.email() returns
  // twoFactorRedirect instead of a session when the account has TOTP
  // enabled; this app has no separate hosted auth page to redirect to,
  // so the same card swaps to a code prompt in place.
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
    // Otherwise the two-factor client plugin's atomListener refreshes the
    // session ($sessionSignal) and better-auth's useSession hook (subscribed
    // in AuthGate) advances to the app — no manual reload/redirect needed.
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

  const backToPassword = () => {
    setNeedsTwoFactor(false);
    setUseBackupCode(false);
    setCode("");
    setError(null);
  };

  return (
    <div className="login-stage">
      {needsTwoFactor ? (
        <form className="login-card" onSubmit={submitTwoFactor}>
          <button type="button" className="login-back" onClick={backToPassword}>
            ← {t("login.back")}
          </button>
          <div className="login-twofa-lead">
            <span className="login-twofa-badge" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <div>
              <h1 className="login-title">{t("login.twoFactorTitle")}</h1>
              <p className="login-subtitle">
                {useBackupCode
                  ? t("login.enterBackupCode")
                  : t("login.enterTwoFactorCode")}
              </p>
            </div>
          </div>
          <label className="login-field">
            <span>
              {useBackupCode ? t("login.backupCode") : t("login.twoFactorCode")}
            </span>
            <input
              className={useBackupCode ? undefined : "login-code"}
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
          <button type="submit" className="login-btn" disabled={busy}>
            {busy ? t("login.signingIn") : t("login.verify")}
          </button>
          <button
            type="button"
            className="login-link"
            onClick={() => {
              setUseBackupCode((v) => !v);
              setCode("");
              setError(null);
            }}
          >
            {useBackupCode ? t("login.useTwoFactorCode") : t("login.useBackupCode")}
          </button>
        </form>
      ) : (
        <form className="login-card" onSubmit={submit}>
          <div className="login-brand">
            <Logo size={30} />
            <span className="login-wordmark">Zenith</span>
          </div>
          <h1 className="login-title">{t("login.title")}</h1>
          <p className="login-subtitle">{t("login.subtitle")}</p>
          <label className="login-field">
            <span>{t("login.email")}</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="login-field">
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
          <button type="submit" className="login-btn" disabled={busy}>
            {busy ? t("login.signingIn") : t("login.signIn")}
          </button>
          <p className="login-hint">{t("login.inviteOnly")}</p>
        </form>
      )}
    </div>
  );
}
