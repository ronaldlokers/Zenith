import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { requestConfirm } from "../hooks";
import { RemoveIcon } from "../icons";
import type { Webhook } from "../types";
import { ActionBar, Button } from "../components";

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
          <ActionBar variant="share">
            <Button disabled={keyBusy} variant="secondary" onClick={generateKey}>
              {t("settings.regenerateLink")}
            </Button>
            <Button disabled={keyBusy} variant="danger" onClick={revokeKey}>
              {t("settings.disableLink")}
            </Button>
          </ActionBar>
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
