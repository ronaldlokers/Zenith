-- Explicit application deadline, distinct from stale-posting detection —
-- a posting can still be live but have its own closing date.
ALTER TABLE applications ADD COLUMN deadline_at TEXT;
