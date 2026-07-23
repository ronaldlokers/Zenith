-- Named CV versions (#474) — a personal library of saved resume variants
-- (e.g. "Backend-focused", "Frontend-focused"). Each stores a JSON snapshot of
-- the CV builder state (profile + work experience + education + languages) so
-- it can be downloaded as a PDF or attached to an application at any time,
-- independent of later edits to the live CV.
CREATE TABLE cv_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cv_versions_user ON cv_versions(user_id);
