-- Snapshot the job description text at apply time (#216) — postings get
-- edited or taken down, so what the user actually applied to is worth
-- keeping even after the live page changes or disappears.
ALTER TABLE applications ADD COLUMN job_description TEXT;
ALTER TABLE applications ADD COLUMN job_description_captured_at TEXT;
