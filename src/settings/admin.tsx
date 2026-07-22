import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { authClient, useSession } from "../auth-client";
import { requestConfirm } from "../hooks";
import { Badge } from "../components";
import { ResetDemoData } from "./data";

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
