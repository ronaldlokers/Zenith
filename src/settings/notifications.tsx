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

export function PushSettings() {
  const { t } = useTranslation();
  const [supported] = useState(
    () => "serviceWorker" in navigator && "PushManager" in window,
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  if (!supported) return null;

  return (
    <div className="admin-invite">
      <h3>{t("account.push")}</h3>
      <p className="muted small">
        {subscribed ? t("account.pushEnabledHint") : t("account.pushDisabledHint")}
      </p>
      {error && <p className="login-error">{error}</p>}
      <button
        disabled={busy || subscribed == null || (!subscribed && !ready)}
        onClick={subscribed ? unsubscribe : subscribe}
      >
        {subscribed ? t("account.pushDisable") : t("account.pushEnable")}
      </button>
    </div>
  );
}
