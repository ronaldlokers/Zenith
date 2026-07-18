-- Webhook delivery visibility (#346): deliveries were fire-and-forget with
-- an empty catch, so a dead receiver stayed "healthy" in Settings forever.
-- Track the last attempt per hook and count consecutive failures; delivery
-- code auto-disables a hook after enough consecutive failures.
ALTER TABLE webhooks ADD COLUMN last_status TEXT;
ALTER TABLE webhooks ADD COLUMN last_attempt_at TEXT;
ALTER TABLE webhooks ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
