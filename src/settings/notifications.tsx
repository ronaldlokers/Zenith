import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

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

// Push and email live in one component deliberately (#62/#114): every
// notification choice belongs in one place rather than email appearing
// somewhere new. The push block is gated on `supported`; email is not — see
// the `supported &&` branch below, not an early return, so email never
// disappears on a browser without push.
export function NotificationSettings() {
  const { t } = useTranslation();
  const [supported] = useState(
    () => "serviceWorker" in navigator && "PushManager" in window,
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Email has nothing to do with push support — fetched and rendered
  // unconditionally below so it never vanishes on a browser without push.
  const [emailReminders, setEmailReminders] = useState(false);
  const [emailDigest, setEmailDigest] = useState(false);
  // Pre-loaded before the user clicks so subscribe() can call
  // pushManager.subscribe() synchronously inside the gesture — see subscribe().
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const keyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supported) return;
    // Warm up both prerequisites on mount, not on click. On iOS/Safari the
    // permission prompt only fires if pushManager.subscribe() runs directly in
    // the click gesture; any awaited network call (fetching the VAPID key) or
    // even `serviceWorker.ready` before it consumes the gesture and the prompt
    // silently no-ops in a standalone PWA — which is why no iOS subscription
    // was ever created.
    Promise.all([navigator.serviceWorker.ready, api.pushPublicKey()])
      .then(async ([reg, { publicKey }]) => {
        regRef.current = reg;
        keyRef.current = publicKey ?? null;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
        setReady(!!publicKey);
      })
      .catch(() => setSubscribed(false));
  }, [supported]);

  useEffect(() => {
    void api
      .getPreferences()
      .then((p) => {
        setEmailReminders(p.emailReminders);
        setEmailDigest(p.emailDigest);
      })
      .catch(() => {});
  }, []);

  // Update the surface first, then fire the request — same shape as the
  // Language and Time zone fields. Sends only the key that changed: the
  // endpoint takes a partial so a concurrent change to the other key isn't
  // clobbered.
  const toggleReminders = (checked: boolean) => {
    setEmailReminders(checked);
    void api.setEmailPreferences({ emailReminders: checked }).catch(() => {});
  };
  const toggleDigest = (checked: boolean) => {
    setEmailDigest(checked);
    void api.setEmailPreferences({ emailDigest: checked }).catch(() => {});
  };

  const subscribe = async () => {
    const reg = regRef.current;
    const publicKey = keyRef.current;
    if (!reg || !publicKey) {
      setError(t("account.pushNotConfigured"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // First async call in the gesture — no awaited fetch precedes it, so iOS
      // still treats this as user-initiated and shows the permission prompt.
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
      const reg = regRef.current ?? (await navigator.serviceWorker.ready);
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

  return (
    <>
      {supported && (
        <div className="admin-invite">
          <h3>{t("account.push")}</h3>
          <p className="muted small">
            {subscribed
              ? t("account.pushEnabledHint")
              : t("account.pushDisabledHint")}
          </p>
          {error && <p className="login-error">{error}</p>}
          <button
            disabled={busy || subscribed == null || (!subscribed && !ready)}
            onClick={subscribed ? unsubscribe : subscribe}
          >
            {subscribed ? t("account.pushDisable") : t("account.pushEnable")}
          </button>
        </div>
      )}
      <div className="admin-invite">
        <h3>{t("account.emailSection")}</h3>
        <p className="muted small">{t("account.emailHint")}</p>
        <label className="settings-field settings-check">
          <input
            type="checkbox"
            checked={emailReminders}
            onChange={(e) => toggleReminders(e.target.checked)}
          />
          <span>{t("account.emailReminders")}</span>
        </label>
        <label className="settings-field settings-check">
          <input
            type="checkbox"
            checked={emailDigest}
            onChange={(e) => toggleDigest(e.target.checked)}
          />
          <span>{t("account.emailDigest")}</span>
        </label>
      </div>
    </>
  );
}
