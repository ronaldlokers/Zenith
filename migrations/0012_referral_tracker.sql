-- Referral tracking (issue #64) — distinct from the existing
-- contact_id, which is usually the recruiter/hiring manager rather
-- than the person who referred the candidate in. Smallest version
-- per the issue: just the link + a badge; the thank-you reminder is
-- a fast-follow once #62's reminder infrastructure exists.
ALTER TABLE applications ADD COLUMN referred_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
