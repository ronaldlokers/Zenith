import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { authClient, signIn } from "./auth-client";
import { Logo } from "./icons";
import { useDocumentTitle } from "./hooks";

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
  // Password recovery (#62). Two more states on the same card rather than
  // separate routes: this app has no hosted auth pages, and the sign-in card
  // already swaps itself for the 2FA prompt the same way.
  //
  // "reset" is entered by arriving with a token in the URL. Better Auth's
  // emailed link hits the Worker, which validates the token and redirects
  // here with it, so a token in the query string means the link was good.
  const resetToken =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("token");
  const [mode, setMode] = useState<"signIn" | "forgot" | "reset">(
    resetToken ? "reset" : "signIn",
  );
  const [sent, setSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [done, setDone] = useState(false);
  // Whether this deployment can send the email at all. Offering the link on
  // an instance with no email provider promises a message nothing will send —
  // the silent dead end this card exists to remove, reintroduced one level up.
  const [canReset, setCanReset] = useState(false);
  useEffect(() => {
    fetch("/api/auth-capabilities")
      .then((r) => (r.ok ? r.json() : { passwordReset: false }))
      .then((c: { passwordReset?: boolean }) => setCanReset(!!c.passwordReset))
      .catch(() => setCanReset(false));
  }, []);
  // Signed out is a page like any other, and it is the one most likely to be
  // sitting in a tab strip beside the app itself.
  useDocumentTitle(t(needsTwoFactor ? "login.twoFactorTitle" : "login.title"));
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  // Where focus goes when a submit fails. The submit button is disabled
  // while busy, and a focused element that becomes disabled drops focus to
  // <body> — so after a wrong password the keyboard user was at the top of
  // the document with no way back to the form but Tab. Measured:
  // document.activeElement was BODY after every failed sign-in.
  //
  // Focus lands on the field to correct rather than back on the button,
  // which is both the conventional answer and the useful one: the password
  // is what was wrong.
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const requestReset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/`,
    });
    setBusy(false);
    // Always the same outcome, never "no such account". Better Auth answers
    // identically either way and pads the timing; saying more here would undo
    // that, and on an invite-only instance whether an address has an account
    // is exactly what should not be discoverable.
    setSent(true);
  };

  const submitNewPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resetError } = await authClient.resetPassword({
      newPassword,
      token: resetToken ?? "",
    });
    setBusy(false);
    if (resetError) {
      // A used or expired link is the common case and the one worth naming:
      // the token is single-use and lasts an hour.
      setError(t("login.resetInvalid"));
      return;
    }
    setDone(true);
    setMode("signIn");
    // Drop the token from the URL so a reload does not retry a spent link.
    window.history.replaceState(null, "", window.location.pathname);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: signInError } = await signIn.email({ email, password });
    setBusy(false);
    if (signInError) {
      setError(t("login.error"));
      emailRef.current?.focus();
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
      codeRef.current?.focus();
    }
  };

  const backToPassword = () => {
    setNeedsTwoFactor(false);
    setUseBackupCode(false);
    setCode("");
    setError(null);
  };

  return (
    // <main>, not a div: this is the whole page when signed out, and without
    // it the document has no main landmark at all — axe flags it as
    // landmark-one-main, and a screen reader's "jump to main" finds nothing
    // to jump to. The signed-in app has had one all along (.content).
    <main className="login-stage">
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
              ref={codeRef}
              aria-invalid={!!error}
              /* aria-invalid said the field was wrong; nothing said why.
                 The alert announces the message once when it appears, but a
                 user who returns to the field afterwards got "invalid" and
                 no explanation. */
              aria-describedby={error ? "login-2fa-error" : undefined}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {/* role="alert", because a failed sign-in was announced by
              nothing at all: the button label reverted from "Signing in…"
              and no live region existed on the page, so to a screen reader a
              wrong password and a stalled network are the same event — on
              the one screen with no way around a dead end. */}
          {error && (
            <p className="login-error" role="alert" id="login-2fa-error">
              {error}
            </p>
          )}
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
          {/* The dead end this screen used to be. Lose the authenticator and
              the backup codes and there is no self-serve way past it — the
              reset is an admin-only route the person cannot know exists, so
              the form asked for a code they could not produce and said
              nothing else.
              Naming no address on purpose: there is no configured operator
              contact to read one from, and a wrong address is worse than a
              true sentence about who can help.
              Shown on the backup-code view only. That is where someone whose
              authenticator is gone actually lands, and it keeps the ordinary
              path — open the app, type six digits — free of a warning about
              a situation they are not in. */}
          {useBackupCode && (
            <p className="login-locked-out muted small">
              {t("login.twoFactorLockedOut")}
            </p>
          )}
        </form>
      ) : mode === "reset" ? (
        <form className="login-card" onSubmit={submitNewPassword}>
          <h1 className="login-title">{t("login.resetTitle")}</h1>
          <p className="login-subtitle">{t("login.resetSubtitle")}</p>
          <label className="login-field">
            <span>{t("login.newPassword")}</span>
            <input
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={8}
              aria-invalid={!!error}
              aria-describedby={error ? "login-reset-error" : undefined}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="login-error" role="alert" id="login-reset-error">
              {error}
            </p>
          )}
          <button type="submit" className="login-btn" disabled={busy}>
            {busy ? t("login.signingIn") : t("login.resetSubmit")}
          </button>
        </form>
      ) : mode === "forgot" ? (
        <form className="login-card" onSubmit={requestReset}>
          <h1 className="login-title">{t("login.forgotTitle")}</h1>
          {sent ? (
            <>
              {/* Deliberately says nothing about whether the account exists. */}
              <p className="login-subtitle" role="status">
                {t("login.forgotSent")}
              </p>
              <button
                type="button"
                className="login-link"
                onClick={() => {
                  setMode("signIn");
                  setSent(false);
                }}
              >
                {t("login.backToSignIn")}
              </button>
            </>
          ) : (
            <>
              <p className="login-subtitle">{t("login.forgotSubtitle")}</p>
              <label className="login-field">
                <span>{t("login.email")}</span>
                <input
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button type="submit" className="login-btn" disabled={busy}>
                {busy ? t("login.signingIn") : t("login.forgotSubmit")}
              </button>
              <button
                type="button"
                className="login-link"
                onClick={() => setMode("signIn")}
              >
                {t("login.backToSignIn")}
              </button>
            </>
          )}
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
              // Focus was on <body> at load, so every sign-in started with a
              // wasted keystroke.
              autoFocus
              ref={emailRef}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
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
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {/* role="alert", because a failed sign-in was announced by
              nothing at all: the button label reverted from "Signing in…"
              and no live region existed on the page, so to a screen reader a
              wrong password and a stalled network are the same event — on
              the one screen with no way around a dead end. */}
          {error && (
            <p className="login-error" role="alert" id="login-error">
              {error}
            </p>
          )}
          <button type="submit" className="login-btn" disabled={busy}>
            {busy ? t("login.signingIn") : t("login.signIn")}
          </button>
          {/* Only when this deployment can actually send the email. */}
          {canReset && (
            <button
              type="button"
              className="login-link"
              onClick={() => {
                setMode("forgot");
                setError(null);
              }}
            >
              {t("login.forgotLink")}
            </button>
          )}
          {done && (
            <p className="login-hint" role="status">
              {t("login.resetDone")}
            </p>
          )}
          <p className="login-hint">{t("login.inviteOnly")}</p>
        </form>
      )}
    </main>
  );
}
