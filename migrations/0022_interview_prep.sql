-- Structured interview prep checklist per application, distinct from the
-- free-text notes field.
CREATE TABLE interview_prep_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_interview_prep_application ON interview_prep_items(application_id);
