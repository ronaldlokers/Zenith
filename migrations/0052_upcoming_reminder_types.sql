-- Day-before follow-up reminders (#62): add the 'upcoming_followup' and
-- 'upcoming_contact' notification types. SQLite can't alter a CHECK in place,
-- so rebuild the table — same pattern as 0041 and 0043.
--
-- NOTE this carries pushed_at, which those earlier rebuilds predate (0051 added
-- it). Copying one of them verbatim would drop the column, and every historical
-- notification would become eligible for re-push inside deliverDuePushes'
-- 24-hour window — exactly the deploy-day storm 0051's backfill exists to stop.
CREATE TABLE notifications_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('due_followup', 'stale_posting', 'feed_match', 'due_contact', 'weekly_digest', 'upcoming_followup', 'upcoming_contact')),
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    dedup_key TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    pushed_at TEXT,
    UNIQUE (user_id, dedup_key)
);

INSERT INTO notifications_new (id, user_id, type, title, body, link, dedup_key, read_at, created_at, pushed_at)
    SELECT id, user_id, type, title, body, link, dedup_key, read_at, created_at, pushed_at FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
