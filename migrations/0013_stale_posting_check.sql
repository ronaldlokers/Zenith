-- Stale-posting detection (issue #65) — advisory only, never changes
-- status automatically. NULL means "not checked yet" or "inconclusive"
-- (network error, no url) — only 'maybe_stale' ever surfaces a badge.
ALTER TABLE applications ADD COLUMN posting_status TEXT;
ALTER TABLE applications ADD COLUMN posting_checked_at TEXT;
