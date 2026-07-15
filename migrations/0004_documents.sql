-- CV versions, cover letters, and other files per application (stored in R2)
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    label TEXT,
    size INTEGER NOT NULL,
    content_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_documents_application ON documents(application_id);
