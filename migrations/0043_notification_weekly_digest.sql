-- Weekly accountability digest: add the 'weekly_digest' notification type.
-- SQLite can't alter a CHECK in place, so rebuild the table (same pattern as
-- 0041) preserving all rows, the FK, the UNIQUE(user_id, dedup_key), and index.
CREATE TABLE notifications_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('due_followup', 'stale_posting', 'feed_match', 'due_contact', 'weekly_digest')),
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    dedup_key TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, dedup_key)
);

INSERT INTO notifications_new (id, user_id, type, title, body, link, dedup_key, read_at, created_at)
    SELECT id, user_id, type, title, body, link, dedup_key, read_at, created_at FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
