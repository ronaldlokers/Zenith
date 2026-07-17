-- Direct ATS job-board sourcing (#219): Greenhouse and Ashby both
-- expose free, keyless public APIs for an individual company's job
-- board. Unlike Adzuna/HN (broad, keyword-matched, genuinely shared
-- across all users), an ATS board is something one specific user asked
-- to watch — so board_slug on feed_items lets /api/feed filter those
-- items to only the user(s) who configured that board, while adzuna/hn
-- items keep the existing shared-pool behavior untouched.

CREATE TABLE feed_ats_boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('greenhouse', 'ashby')),
    slug TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, source, slug)
);
CREATE INDEX idx_feed_ats_boards_user ON feed_ats_boards(user_id);

-- Widen feed_items.source's CHECK and add board_slug — SQLite can't
-- alter a CHECK constraint in place, hence the rebuild (same pattern
-- as 0025_remove_arbeitnow_source.sql).
CREATE TABLE feed_items_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL CHECK (source IN ('adzuna', 'hn', 'arbeitnow', 'greenhouse', 'ashby')),
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    url TEXT,
    salary_text TEXT,
    role_type TEXT NOT NULL DEFAULT 'other',
    posted_at TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'added', 'dismissed')),
    board_slug TEXT,
    UNIQUE (source, external_id)
);
INSERT INTO feed_items_new (id, source, external_id, title, company, location, url, salary_text, role_type, posted_at, fetched_at, status)
SELECT id, source, external_id, title, company, location, url, salary_text, role_type, posted_at, fetched_at, status FROM feed_items;
DROP TABLE feed_items;
ALTER TABLE feed_items_new RENAME TO feed_items;
