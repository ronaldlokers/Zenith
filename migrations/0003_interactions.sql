-- Timeline of touchpoints per application
CREATE TABLE interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'other'
        CHECK (type IN ('email', 'call', 'message', 'interview', 'meeting', 'other')),
    happened_at TEXT NOT NULL DEFAULT (date('now')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_interactions_application ON interactions(application_id);
