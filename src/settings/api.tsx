import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { formatDateWithYear } from "../format";
import { requestConfirm } from "../hooks";
import { RemoveIcon } from "../icons";
import type { Webhook } from "../types";
import { ActionBar, Button } from "../components";
import "./settings.css";

// Public API key + webhooks (#228). The key is shown once at generation and
// never again (#381) — only its SHA-256 digest is stored, so there is no read
// path left to show it from. Afterwards Settings identifies it by its last
// four characters and creation date. Same show-once contract as a webhook's
// signing secret (see addWebhook below) and the 2FA backup codes.
export function PublicApiSettings({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [keyHint, setKeyHint] = useState<string | null>(null);
  // Whether the key's status is actually known. keyHint === null meant two
  // different things — "you have no key" and "we could not ask" — and the
  // panel rendered both as the first one.
  const [keyKnown, setKeyKnown] = useState(false);
  const [keyCreatedAt, setKeyCreatedAt] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
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
    api
      .profile()
      .then((p) => {
        setKeyHint(p.api_key_hint);
        setKeyCreatedAt(p.api_key_created_at);
        setKeyKnown(true);
      })
      // The only call in this file that did not report its failure. It left
      // the panel saying there was no key, which is a claim about someone's
      // account rather than a missing detail.
      .catch((e) => onError((e as Error).message));
    loadWebhooks();
  }, [loadWebhooks, onError]);

  const generateKey = async () => {
    // Regenerating (a key already exists) invalidates the current one, so
    // warn — but the first-time generate has nothing to break (#285).
    //
    // That holds only while keyHint is known to be accurate. When the load
    // failed it is null, which read as "no key" and skipped this warning —
    // so a failed read quietly removed the guard on revoking a live key and
    // breaking whatever was authenticating with it. Unknown is treated as
    // "there may be one".
    if (
      (keyHint || !keyKnown) &&
      !(await requestConfirm(t("account.regenerateKeyConfirm")))
    )
      return;
    setKeyBusy(true);
    api
      .generateApiKey()
      .then((r) => {
        setNewApiKey(r.api_key);
        setKeyHint(r.api_key.slice(-4));
        setKeyCreatedAt(new Date().toISOString());
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setKeyBusy(false));
  };

  const revokeKey = async () => {
    if (!(await requestConfirm(t("account.revokeKeyConfirm")))) return;
    setKeyBusy(true);
    api
      .revokeApiKey()
      .then(() => {
        setNewApiKey(null);
        setKeyHint(null);
        setKeyCreatedAt(null);
      })
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

  const removeWebhook = async (id: number) => {
    // The only destructive control in Settings that did not ask. Its signing
    // secret is shown once at creation and never again, so a mis-click
    // destroys something unrecoverable — the same reason every other
    // destructive control on this page confirms.
    if (!(await requestConfirm(t("confirm.deleteWebhook")))) return;
    api
      .removeWebhook(id)
      .then(loadWebhooks)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.apiKey")}</h3>
      <p className="muted small">{t("account.apiKeyHint")}</p>
      {newApiKey && (
        <>
          {/* Sentence outside the mono box: .tfa-secret sets word-break:
              break-all, which is right for an unbroken key and mangles prose. */}
          <p className="muted small">{t("account.apiKeyOnceHint")}</p>
          <p className="tfa-secret">{newApiKey}</p>
        </>
      )}
      {!keyKnown && !keyHint ? (
        // Say the status is unknown, and still offer the button: hiding it
        // would leave someone unable to create a key at all until they
        // reload, which is a worse answer than asking. generateKey treats
        // unknown as "there may be one" and warns.
        <>
          <p className="muted small">{t("account.apiKeyUnknown")}</p>
          <button disabled={keyBusy} onClick={generateKey}>
            {t("account.apiKeyGenerate")}
          </button>
        </>
      ) : keyHint ? (
        <>
          <p className="muted small">
            {keyCreatedAt
              ? t("account.apiKeyActiveOn", {
                  hint: keyHint,
                  date: formatDateWithYear(keyCreatedAt),
                })
              : t("account.apiKeyActive", { hint: keyHint })}
          </p>
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
              {/* Checked before `!enabled`, because a blocked hook is also
                  disabled and "disabled" alone sends the user to re-enable
                  it — which changes nothing. The URL is what has to change. */}
              {w.last_status === "blocked" ? (
                <span className="muted small warn-text">
                  {" "}
                  · {t("account.webhookBlocked")}
                </span>
              ) : !w.enabled ? (
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
            <Button
              variant="danger"
              className="zui-webhook-remove"
              onClick={() => void removeWebhook(w.id)}
            >
              <RemoveIcon />
            </Button>
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
