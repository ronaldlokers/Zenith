-- Public API + webhooks (#228). api_key lives on profile alongside the
-- existing share_token/calendar_token — same unguessable-token model,
-- just carried as a Bearer header instead of embedded in a URL (which
-- is actually the more conservative of the two: headers aren't logged
-- by proxies/browser history the way URLs are).
ALTER TABLE profile ADD COLUMN api_key TEXT;
CREATE UNIQUE INDEX idx_profile_api_key ON profile(api_key);

-- One event type for now: application.status_changed. secret signs
-- delivered payloads (HMAC-SHA256) so a receiver can verify a webhook
-- actually came from this app.
CREATE TABLE webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_webhooks_user ON webhooks(user_id);
