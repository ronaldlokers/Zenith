-- Optimistic concurrency for contacts and companies.
--
-- The PUT routes for both write every column from the body, and their forms
-- seed from the record loaded when the page opened. So a form saved from a
-- laptop that has been open a while puts back every field as it was — over a
-- note typed on a phone since, or over an outreach status the composer set.
-- Applications already carry updated_at and honour If-Match; these two had
-- only created_at, so the same protection had nowhere to anchor.
--
-- Backfilled from created_at rather than 'now': a row that has not been
-- touched since it was made is accurately described by its creation time, and
-- stamping every existing row with the deploy time would make every open form
-- stale at once.
ALTER TABLE contacts ADD COLUMN updated_at TEXT;
UPDATE contacts SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE companies ADD COLUMN updated_at TEXT;
UPDATE companies SET updated_at = created_at WHERE updated_at IS NULL;
