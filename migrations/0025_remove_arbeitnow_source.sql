-- Remove Arbeitnow as an ingestible feed source (#165) — its listings
-- skew heavily German/DACH-market, out of step with the rest of the feed
-- configuration. feed_items already ingested with source = 'arbeitnow'
-- are left alone as historical data; only the per-user feed_sources
-- toggle (which drove new ingestion) is removed.
DELETE FROM feed_sources WHERE source = 'arbeitnow';

CREATE TABLE feed_sources_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('adzuna', 'hn')),
    enabled INTEGER NOT NULL DEFAULT 1,
    location TEXT,
    UNIQUE (user_id, source)
);
INSERT INTO feed_sources_new SELECT * FROM feed_sources;
DROP TABLE feed_sources;
ALTER TABLE feed_sources_new RENAME TO feed_sources;
