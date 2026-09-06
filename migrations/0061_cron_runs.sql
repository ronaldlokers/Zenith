-- Operator visibility for the scheduled tasks (#61 in the product review).
--
-- Every cron task is wrapped in independently(), whose entire failure signal
-- is a console.error. Workers Logs captures it and has no alerting, so the
-- only way to learn that the weekly digest has been throwing for a month was
-- to open the Cloudflare dashboard and go looking.
--
-- Records every run, not only the failures. A task that throws leaves an
-- error row; a task that silently stops firing leaves nothing at all, and
-- that is the worse failure — "backup last succeeded eleven days ago" is the
-- sentence that catches it, and it can only be said by something that also
-- records the successes.
--
-- Not the notifications table: that CHECK constraint would need the table
-- recreated (see 0052), and a cron outcome is operator information rather
-- than something to put in a person's notification bell next to their due
-- follow-ups.
--
-- This is not telemetry. The locked decision is about not tracking users;
-- nothing here leaves the operator's own database, and no third party is
-- involved.
CREATE TABLE cron_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    ok INTEGER NOT NULL,
    error TEXT,
    ran_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The admin view reads the most recent run per label, and the prune deletes
-- by age; both walk this index rather than the table.
CREATE INDEX idx_cron_runs_label_ran_at ON cron_runs (label, ran_at DESC);
