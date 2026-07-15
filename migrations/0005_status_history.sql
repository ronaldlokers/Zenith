-- Every status transition, for funnel and time-in-stage stats
CREATE TABLE status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_status_history_application ON status_history(application_id);

CREATE TRIGGER trg_applications_status_insert
AFTER INSERT ON applications
BEGIN
    INSERT INTO status_history (application_id, from_status, to_status)
    VALUES (NEW.id, NULL, NEW.status);
END;

CREATE TRIGGER trg_applications_status_update
AFTER UPDATE OF status ON applications
WHEN OLD.status != NEW.status
BEGIN
    INSERT INTO status_history (application_id, from_status, to_status)
    VALUES (NEW.id, OLD.status, NEW.status);
END;

-- Seed history for existing applications: one row at their creation time
INSERT INTO status_history (application_id, from_status, to_status, changed_at)
SELECT id, NULL, status, created_at FROM applications;
