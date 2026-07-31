-- Per-user IANA timezone (#518). The server had no way to know what day it is
-- for a given user: SQLite's date('now') is UTC and has no notion of a user,
-- so due follow-ups fired on the UTC day boundary. NULL means "not set",
-- which the worker treats as UTC — the same shape as locale NULL meaning 'en'.
ALTER TABLE "user" ADD COLUMN timezone TEXT;

-- Recording a notification is now separate from pushing it. The record is
-- created whenever it is generated; the push waits until the owner reaches
-- 08:00 in their own timezone. NULL means "not pushed yet".
ALTER TABLE notifications ADD COLUMN pushed_at TEXT;

-- Existing rows were already delivered by the old insert-and-push path. Without
-- this, the first run of deliverDuePushes after deploy would re-push every
-- notification from the preceding 24 hours.
UPDATE notifications SET pushed_at = created_at;
