-- Free-form, user-defined tags on applications (e.g. "dream job", "backup",
-- "remote-only") as a cross-cutting dimension the fixed role_type/status
-- filters don't cover.
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE application_tags (
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (application_id, tag_id)
);
