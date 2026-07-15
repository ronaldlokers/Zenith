-- Interactions can now attach to a contact, an application, or both.
-- SQLite can't relax NOT NULL in place, so rebuild the table.
ALTER TABLE interactions RENAME TO interactions_old;

CREATE TABLE interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'other'
        CHECK (type IN ('email', 'call', 'message', 'interview', 'meeting', 'other')),
    happened_at TEXT NOT NULL DEFAULT (date('now')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (application_id IS NOT NULL OR contact_id IS NOT NULL)
);

INSERT INTO interactions (id, application_id, type, happened_at, notes, created_at)
SELECT id, application_id, type, happened_at, notes, created_at FROM interactions_old;

DROP TABLE interactions_old;

CREATE INDEX idx_interactions_application ON interactions(application_id);
CREATE INDEX idx_interactions_contact ON interactions(contact_id);
