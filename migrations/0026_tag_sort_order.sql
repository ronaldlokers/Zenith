-- Per-application tag ordering (#207) — tags previously had no user-
-- controlled order (implicit insertion order), matching the gap CV
-- sections already closed for their own list ordering (#94).
ALTER TABLE application_tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
