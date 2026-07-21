// Settings sub-components extracted from App.tsx (#285 split). SettingsPage
// itself stays in App (it also renders FeedSettings, which would form a
// cycle); these are the self-contained leaf sections it composes.
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { authClient, signOut, useSession } from "./auth-client";
import { requestConfirm } from "./hooks";
import { RemoveIcon } from "./icons";
import {
  CV_LANG_KEY,
  formatDate,
  getCvLanguage,
  KEY_SHORTCUTS_KEY,
  keyShortcutsEnabled,
} from "./format";
import type { RoleTypeDef, Webhook } from "./types";
import { useLocation } from "react-router-dom";
import { Badge, Button } from "./components";
import { FeedSettings } from "./feed";

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

// Admin user management (#285) — the recovery path for a locked-out user:
// list users, reset a forgotten password to a new temporary one, reset a
// lost 2FA, or remove an account. Without this, recovery meant editing D1
// by hand.
type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  twoFactorEnabled: boolean | null;
};
export function AdminUsers({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authClient.admin.listUsers({ query: { limit: 100 } });
    if (res.error) {
      onError(t("account.usersLoadError"));
      return;
    }
    // twoFactorEnabled is a real user column but not in the client's typed
    // UserWithRole, so widen through unknown.
    setUsers((res.data?.users ?? []) as unknown as AdminUser[]);
  }, [onError, t]);

  useEffect(() => {
    load();
  }, [load]);

  const resetPassword = async (u: AdminUser) => {
    // A one-off temporary password the admin relays; the user changes it
    // themselves via ChangePassword after logging in. 128 bits of entropy
    // (#285 security review) — a truncated UUID was far too guessable.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const temp =
      "Reset-" +
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await authClient.admin.setUserPassword({
      userId: u.id,
      newPassword: temp,
    });
    if (error) {
      onError(t("account.resetPasswordError"));
      return;
    }
    setNotice(t("account.tempPasswordSet", { email: u.email, password: temp }));
  };

  const reset2fa = (u: AdminUser) =>
    api
      .resetUser2fa(u.id)
      .then(() => {
        setNotice(t("account.twoFactorReset", { email: u.email }));
        return load();
      })
      .catch((e) => onError((e as Error).message));

  const remove = async (u: AdminUser) => {
    if (
      !(await requestConfirm(
        t("account.removeUserConfirm", { email: u.email }),
      ))
    )
      return;
    const { error } = await authClient.admin.removeUser({ userId: u.id });
    if (error) {
      onError(t("account.removeUserError"));
      return;
    }
    return load();
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.manageUsers")}</h3>
      {notice && <p className="admin-invite-success">{notice}</p>}
      <ul className="settings-list">
        {(users ?? []).map((u) => (
          <li key={u.id} className="admin-user">
            <span className="admin-user-id">
              {u.name ?? u.email}
              <span className="muted small"> · {u.email}</span>
              {u.twoFactorEnabled ? (
                <Badge> 2FA</Badge>
              ) : null}
            </span>
            {u.id !== session?.user.id && (
              <span className="admin-user-actions">
                <button onClick={() => resetPassword(u)}>
                  {t("account.resetPassword")}
                </button>
                {u.twoFactorEnabled ? (
                  <button onClick={() => reset2fa(u)}>
                    {t("account.reset2fa")}
                  </button>
                ) : null}
                <button className="danger" onClick={() => remove(u)}>
                  {t("account.removeUser")}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminInvite() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const { error } = await authClient.admin.createUser({
      email,
      name,
      password,
      role,
    });
    setBusy(false);
    if (error) {
      setResult({ ok: false, message: t("account.inviteError") });
      return;
    }
    setResult({ ok: true, message: t("account.inviteSuccess", { email }) });
    setEmail("");
    setName("");
    setPassword("");
    setRole("user");
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.adminInvite")}</h3>
      <form onSubmit={submit}>
        <label className="settings-field">
          <span>{t("account.inviteName")}</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="settings-field">
          <span>{t("account.inviteEmail")}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>{t("account.invitePassword")}</span>
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>{t("account.inviteRole")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
            <option value="user">{t("account.inviteRoleUser")}</option>
            <option value="admin">{t("account.inviteRoleAdmin")}</option>
          </select>
        </label>
        {result && (
          <p className={result.ok ? "admin-invite-success" : "login-error"}>
            {result.message}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {t("account.inviteSubmit")}
        </button>
      </form>
      <ResetDemoData />
    </div>
  );
}

// Per-user sample data (#281) — a new/invited user can fill an empty
// account with the example dataset to explore, then wipe it in one click.
// A full reload after either action is the simplest way to refresh every
// tab's data at once.
export function SampleDataSettings({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{
    loaded: boolean;
    hasData: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .sampleDataStatus()
      .then(setStatus)
      .catch((e) => onError((e as Error).message));
  }, [onError]);

  if (!status) return null;
  // Nothing to offer once the account has real (non-sample) data.
  if (status.hasData && !status.loaded) return null;

  const load = () => {
    setBusy(true);
    api
      .loadSampleData()
      .then(() => window.location.reload())
      .catch((e) => {
        onError((e as Error).message);
        setBusy(false);
      });
  };
  const clear = async () => {
    if (!(await requestConfirm(t("sampleData.clearConfirm")))) return;
    setBusy(true);
    api
      .clearSampleData()
      .then(() => window.location.reload())
      .catch((e) => {
        onError((e as Error).message);
        setBusy(false);
      });
  };

  return (
    <div className="sample-data">
      <h3>{t("sampleData.title")}</h3>
      {status.loaded ? (
        <>
          <p className="muted small">{t("sampleData.loadedHint")}</p>
          <button disabled={busy} onClick={clear}>
            {t("sampleData.clear")}
          </button>
        </>
      ) : (
        <>
          <p className="muted small">{t("sampleData.emptyHint")}</p>
          <button disabled={busy} onClick={load}>
            {t("sampleData.load")}
          </button>
        </>
      )}
    </div>
  );
}

export function ResetDemoData() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reset-demo-data", { method: "POST" });
      setMessage(
        res.ok ? t("account.resetDemoSuccess") : t("account.resetDemoError"),
      );
    } catch {
      setMessage(t("account.resetDemoError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.resetDemo")}</h3>
      {message && <p className="admin-invite-success">{message}</p>}
      <button disabled={busy} onClick={reset}>
        {t("account.resetDemoSubmit")}
      </button>
    </div>
  );
}

// Public API key + webhooks (#228) — the key is shown in full whenever
// it exists (unlike a password) since it's meant to be copied into
// another tool's config; a webhook's signing secret, by contrast, is
// only ever shown once at creation (see addWebhook below), same as the
// 2FA backup codes.
export function PublicApiSettings({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);

  const loadWebhooks = useCallback(
    () =>
      api
        .webhooks()
        .then(setWebhooks)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    api.profile().then((p) => setApiKey(p.api_key));
    loadWebhooks();
  }, [loadWebhooks]);

  const generateKey = async () => {
    // Regenerating (a key already exists) invalidates the current one, so
    // warn — but the first-time generate has nothing to break (#285).
    if (apiKey && !(await requestConfirm(t("account.regenerateKeyConfirm"))))
      return;
    setKeyBusy(true);
    api
      .generateApiKey()
      .then((r) => setApiKey(r.api_key))
      .catch((e) => onError((e as Error).message))
      .finally(() => setKeyBusy(false));
  };

  const revokeKey = async () => {
    if (!(await requestConfirm(t("account.revokeKeyConfirm")))) return;
    setKeyBusy(true);
    api
      .revokeApiKey()
      .then(() => setApiKey(null))
      .catch((e) => onError((e as Error).message))
      .finally(() => setKeyBusy(false));
  };

  const addWebhook = (e: FormEvent) => {
    e.preventDefault();
    const url = newWebhookUrl.trim();
    if (!url) return;
    setWebhookBusy(true);
    api
      .addWebhook(url)
      .then((r) => {
        setNewWebhookUrl("");
        setNewWebhookSecret(r.secret);
        return loadWebhooks();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setWebhookBusy(false));
  };

  const removeWebhook = (id: number) => {
    api
      .removeWebhook(id)
      .then(loadWebhooks)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.apiKey")}</h3>
      <p className="muted small">{t("account.apiKeyHint")}</p>
      {apiKey ? (
        <>
          <input readOnly value={apiKey} onClick={(e) => (e.target as HTMLInputElement).select()} />
          <div className="share-actions">
            <Button disabled={keyBusy} variant="secondary" onClick={generateKey}>
              {t("settings.regenerateLink")}
            </Button>
            <Button disabled={keyBusy} variant="danger" onClick={revokeKey}>
              {t("settings.disableLink")}
            </Button>
          </div>
        </>
      ) : (
        <button disabled={keyBusy} onClick={generateKey}>
          {t("account.apiKeyGenerate")}
        </button>
      )}

      <h3>{t("account.webhooks")}</h3>
      <p className="muted small">{t("account.webhooksHint")}</p>
      {newWebhookSecret && (
        <p className="tfa-secret">
          {t("account.webhookSecretHint")}
          <br />
          {newWebhookSecret}
        </p>
      )}
      <ul className="settings-list">
        {(webhooks ?? []).map((w) => (
          <li key={w.id}>
            <span>
              {w.url}
              {!w.enabled ? (
                <span className="muted small warn-text">
                  {" "}
                  · {t("account.webhookDisabled")}
                </span>
              ) : w.last_status === "failed" ? (
                <span className="muted small warn-text">
                  {" "}
                  · {t("account.webhookFailing", { count: w.failure_count })}
                </span>
              ) : w.last_status === "ok" ? (
                <span className="muted small">
                  {" "}
                  · {t("account.webhookOk")}
                </span>
              ) : null}
            </span>
            <button className="danger" onClick={() => removeWebhook(w.id)}>
              <RemoveIcon />
            </button>
          </li>
        ))}
      </ul>
      <form className="settings-add" onSubmit={addWebhook}>
        <input
          type="url"
          placeholder="https://example.com/webhook"
          value={newWebhookUrl}
          onChange={(e) => setNewWebhookUrl(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={webhookBusy}>
          {t("feedSettings.add")}
        </Button>
      </form>

      <ApiDocs />
    </div>
  );
}

// API reference (#283) — documents the read-only v1 API and webhooks right
// where the key and hooks are managed. The base URL is derived from the
// current origin so it's correct on any deployment.
export function ApiDocs() {
  const { t } = useTranslation();
  const base = `${window.location.origin}/api/v1`;
  return (
    <details className="api-docs">
      <summary>{t("apiDocs.title")}</summary>
      <p className="muted small">{t("apiDocs.intro")}</p>
      <pre>
        <code>{base}</code>
      </pre>

      <h4>{t("apiDocs.authHeading")}</h4>
      <p className="muted small">{t("apiDocs.auth")}</p>
      <pre>
        <code>Authorization: Bearer YOUR_API_KEY</code>
      </pre>

      <h4>{t("apiDocs.endpointsHeading")}</h4>
      <ul className="api-endpoints">
        <li>
          <code>GET /applications</code>
          <span className="muted small">{t("apiDocs.listDesc")}</span>
        </li>
        <li>
          <code>GET /applications/:id</code>
          <span className="muted small">{t("apiDocs.getDesc")}</span>
        </li>
      </ul>
      <p className="muted small">{t("apiDocs.fieldsNote")}</p>

      <h4>{t("apiDocs.exampleHeading")}</h4>
      <pre>
        <code>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  ${base}/applications`}</code>
      </pre>

      <h4>{t("apiDocs.webhooksHeading")}</h4>
      <p className="muted small">{t("apiDocs.webhookIntro")}</p>
      <pre>
        <code>{`{
  "event": "application.status_changed",
  "data": {
    "application_id": 42,
    "from_status": "screening",
    "to_status": "interview"
  },
  "sent_at": "2026-07-17T12:00:00.000Z"
}`}</code>
      </pre>
      <p className="muted small">{t("apiDocs.signatureNote")}</p>
      <pre>
        <code>{`import crypto from "node:crypto";
const expected = crypto
  .createHmac("sha256", WEBHOOK_SECRET)
  .update(rawRequestBody)
  .digest("hex");
// timing-safe compare expected === X-Zenith-Signature`}</code>
      </pre>
    </details>
  );
}

// Web Push (#214) — base64url VAPID public key -> the raw byte array
// PushManager.subscribe() needs, per the standard applicationServerKey
// conversion (browsers don't accept the base64url string directly).
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function PushSettings() {
  const { t } = useTranslation();
  const [supported] = useState(
    () => "serviceWorker" in navigator && "PushManager" in window,
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false));
  }, [supported]);

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const { publicKey } = await api.pushPublicKey();
      if (!publicKey) {
        setError(t("account.pushNotConfigured"));
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api.pushSubscribe(sub.toJSON() as PushSubscriptionJSON);
      setSubscribed(true);
    } catch {
      setError(t("account.pushError"));
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.pushUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError(t("account.pushError"));
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  return (
    <div className="admin-invite">
      <h3>{t("account.push")}</h3>
      <p className="muted small">
        {subscribed ? t("account.pushEnabledHint") : t("account.pushDisabledHint")}
      </p>
      {error && <p className="login-error">{error}</p>}
      <button disabled={busy || subscribed == null} onClick={subscribed ? unsubscribe : subscribe}>
        {subscribed ? t("account.pushDisable") : t("account.pushEnable")}
      </button>
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
  | "feed"
  | "sharing"
  | "security"
  | "integrations"
  | "data"
  | "admin";

const SETTINGS_SECTIONS: SettingsSection[] = [
  "general",
  "feed",
  "sharing",
  "security",
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
    "feed",
    "sharing",
    ...(session ? (["security", "integrations", "data"] as const) : []),
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
        {session && (
          <div className="account-signed-in">
            <span>{t("account.signedInAs", { email: session.user.email })}</span>
            <button onClick={() => signOut()}>{t("account.signOut")}</button>
          </div>
        )}
        {apiError && <p className="login-error">{apiError}</p>}
        {section === "general" && (
          <>
        <div className="settings-fieldgrid">
        <label className="settings-field">
          <span>{t("settings.language")}</span>
          <select
            value={i18n.resolvedLanguage}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
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
              <div className="share-actions">
                <Button disabled={shareBusy} variant="secondary" onClick={generateLink}>
                  {t("settings.regenerateLink")}
                </Button>
                <Button disabled={shareBusy} variant="danger" onClick={disableLink}>
                  {t("settings.disableLink")}
                </Button>
              </div>
            </>
          ) : (
            <button disabled={shareBusy} onClick={generateLink}>
              {t("settings.generateLink")}
            </button>
          )}
        </div>
        <div className="settings-field share-field">
          <span>{t("settings.calendarLink")}</span>
          {calendarUrl ? (
            <>
              <input readOnly value={calendarUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
              <p className="muted small">{t("settings.calendarLinkHint")}</p>
              <div className="share-actions">
                <Button disabled={calendarBusy} variant="secondary" onClick={generateCalendarLink}>
                  {t("settings.regenerateLink")}
                </Button>
                <Button disabled={calendarBusy} variant="danger" onClick={disableCalendarLink}>
                  {t("settings.disableLink")}
                </Button>
              </div>
            </>
          ) : (
            <button disabled={calendarBusy} onClick={generateCalendarLink}>
              {t("settings.generateLink")}
            </button>
          )}
        </div>
          </>
        )}
        {section === "security" && session && (
          <div className="account-section">
            <TwoFactorSettings />
            <SessionManagement />
            <ChangePassword />
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
            <DeleteAccount onError={setApiError} />
          </div>
        )}
        {section === "admin" && session?.user.role === "admin" && (
          <div className="account-section">
            <AdminUsers onError={setApiError} />
            <AdminInvite />
          </div>
        )}
      </div>
    </section>
  );
}
