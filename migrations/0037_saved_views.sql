-- Saved views (#277) — named snapshots of the Jobs tab filter/sort state,
-- per user. `filters` is a JSON blob so the shape can evolve without a
-- migration; the client owns its schema.
CREATE TABLE saved_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    filters TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_saved_views_user ON saved_views(user_id, created_at);
