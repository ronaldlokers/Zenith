-- Public read-only share link (issue #113) — an unguessable token gating
-- a single unauthenticated route that shows aggregate Stats only, no
-- per-application detail, no edit capability.
ALTER TABLE profile ADD COLUMN share_token TEXT;
