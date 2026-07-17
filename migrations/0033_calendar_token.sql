-- ICS calendar subscribe link (#215) — same unguessable-token pattern
-- as the Stats share link (0020_share_link.sql): a single unauthenticated
-- route gated by this token, outside /api entirely.
-- SQLite can't add a UNIQUE column via ALTER TABLE, hence the separate index.
ALTER TABLE profile ADD COLUMN calendar_token TEXT;
CREATE UNIQUE INDEX idx_profile_calendar_token ON profile(calendar_token);
