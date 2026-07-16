-- Soft archive: "no longer interested" no longer means permanent delete.
-- Archived applications are hidden from the default Jobs list and pipeline
-- views but keep contributing to Stats history.
ALTER TABLE applications ADD COLUMN archived_at TEXT;
