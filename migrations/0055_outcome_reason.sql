-- Why an application ended (#381). The reason attaches to the transition,
-- not the application: an application reopened and closed again records two
-- distinct outcomes instead of overwriting the first, and the reason stays
-- bound to the stage it happened at (from_status is on the same row).
--
-- Only rows whose to_status is terminal ever carry these. No backfill —
-- closures recorded before this ship have no reason, and the Insights
-- breakdown counts them as "not recorded" rather than guessing.
--
-- Slugs are stored, never labels: the wording lives in the locale files, so
-- rewording a reason never touches data. The allowed set is scoped per
-- terminal status and enforced in worker/index.ts, not here — SQLite CHECK
-- constraints can't be altered onto an existing table without a rebuild.
ALTER TABLE status_history ADD COLUMN outcome_reason TEXT;
ALTER TABLE status_history ADD COLUMN outcome_note TEXT;
