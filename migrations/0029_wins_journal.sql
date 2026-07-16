-- Milestone/wins journal (#225) — a personal log of small wins during
-- the search (good feedback, a strong interview, a callback), separate
-- from the pipeline data itself since not every win maps to a status
-- change worth recording on an application.
CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_journal_entries_user ON journal_entries(user_id);
