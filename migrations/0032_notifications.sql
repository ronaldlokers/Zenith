-- In-app notification center (#213): due/overdue follow-ups, stale
-- postings, and new Feed matches. dedup_key makes generation idempotent
-- across cron runs (ON CONFLICT DO NOTHING) instead of needing separate
-- "have I already notified for this" bookkeeping.
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('due_followup', 'stale_posting', 'feed_match')),
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    dedup_key TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, dedup_key)
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
