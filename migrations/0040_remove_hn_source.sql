-- Remove Hacker News "Who's Hiring" as a feed source. Its listings are
-- unreliable (free-text comment scraping, no structured location/role),
-- and Adzuna covers the use case far better. Purge already-ingested hn
-- items and drop the per-user source toggle that drove new ingestion;
-- Adzuna becomes the only ingestible aggregate source (Greenhouse/Ashby
-- ATS boards are configured separately). Mirrors the arbeitnow removal
-- (#165, migration 0025).
DELETE FROM feed_items WHERE source = 'hn';
DELETE FROM feed_sources WHERE source = 'hn';

CREATE TABLE feed_sources_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('adzuna')),
    enabled INTEGER NOT NULL DEFAULT 1,
    location TEXT,
    UNIQUE (user_id, source)
);
INSERT INTO feed_sources_new SELECT * FROM feed_sources;
DROP TABLE feed_sources;
ALTER TABLE feed_sources_new RENAME TO feed_sources;
