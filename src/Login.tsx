import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { signIn } from "./auth-client";

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await signIn.email({ email, password });
    setBusy(false);
    if (signInError) {
      setError(t("login.error"));
    }
    // On success, better-auth's useSession hook (subscribed in App) picks
    // up the new session automatically — no manual reload/redirect needed.
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>JobSeekr</h1>
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
