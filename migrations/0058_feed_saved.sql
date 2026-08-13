-- A third triage outcome for the feed: "saved".
--
-- Triage was binary — add to the pipeline, or dismiss — so a posting the user
-- was unsure about had only one place to go, and it was the pipeline. That
-- inflates the application count every other surface reasons from: the board's
-- columns, the funnel, the response rate, the momentum verdict. A "maybe"
-- became an application you never sent.
--
-- Saved is deliberately NOT a pipeline state. It lives on the feed's own join
-- table beside 'new'/'added'/'dismissed', so a saved posting stays in the feed
-- and never reaches applications at all. Three-way triage — act, keep, discard
-- — is the standard shape for exactly this reason: the "later" pile exists so
-- undecided items stop being re-read on every pass.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt. Same
-- columns, same unique key, same default; only the allowed values change.
CREATE TABLE feed_item_status_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_item_id INTEGER NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'added', 'dismissed', 'saved')),
    UNIQUE (feed_item_id, user_id)
);

INSERT INTO feed_item_status_new (id, feed_item_id, user_id, status)
SELECT id, feed_item_id, user_id, status FROM feed_item_status;

DROP TABLE feed_item_status;
ALTER TABLE feed_item_status_new RENAME TO feed_item_status;

CREATE INDEX idx_feed_item_status_user ON feed_item_status(user_id);
