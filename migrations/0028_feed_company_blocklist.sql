-- Per-user company blocklist for the Feed (#218) — feed_items is a
-- shared pool across users (see feed.ts), so blocking has to be a
-- per-user filter applied at read time, same as feed_role_keywords /
-- feed_sources rather than something that mutates the shared rows.
CREATE TABLE feed_company_blocklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, company COLLATE NOCASE)
);

CREATE INDEX idx_feed_company_blocklist_user ON feed_company_blocklist(user_id);
