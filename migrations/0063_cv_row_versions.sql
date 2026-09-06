-- Optimistic concurrency for the three CV forms, finishing what 0060 started.
--
-- 0060 gave contacts and companies an updated_at and an If-Match precondition,
-- because their PUT routes write every column from a form that seeded when the
-- page opened. PUT /api/work-experience/:id, PUT /api/education/:id and
-- PUT /api/profile are the same shape and were left out: they rewrite every
-- field they own with no validator, and these tables had no updated_at for one
-- to anchor to.
--
-- A CV tab left open since breakfast, saved after the summary was rewritten on
-- a phone, put the old summary back. Both saves returned 200 and nothing said
-- so. The CV is edited slowly, which makes these the forms most likely to be
-- sitting open.
--
-- Backfilled from 'now' rather than created_at, unlike 0060: none of these
-- three tables has a created_at to read. That would be a problem if any client
-- currently sent If-Match for these routes — every open form would go stale at
-- once — but none does, and the precondition is additive, so a client that
-- loaded before this migration simply sends no header and behaves as before.
ALTER TABLE work_experience ADD COLUMN updated_at TEXT;
UPDATE work_experience SET updated_at = datetime('now') WHERE updated_at IS NULL;

ALTER TABLE education ADD COLUMN updated_at TEXT;
UPDATE education SET updated_at = datetime('now') WHERE updated_at IS NULL;

ALTER TABLE profile ADD COLUMN updated_at TEXT;
UPDATE profile SET updated_at = datetime('now') WHERE updated_at IS NULL;
