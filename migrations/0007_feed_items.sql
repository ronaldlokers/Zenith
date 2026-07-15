-- Job listings pulled from free external sources, awaiting review
CREATE TABLE feed_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL CHECK (source IN ('adzuna', 'hn', 'arbeitnow')),
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    url TEXT,
    salary_text TEXT,
    role_type TEXT NOT NULL DEFAULT 'other'
        CHECK (role_type IN ('devops', 'platform-engineer', 'front-end', 'typescript', 'other')),
    posted_at TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'added', 'dismissed')),
    UNIQUE (source, external_id)
);

CREATE INDEX idx_feed_items_status ON feed_items(status);
