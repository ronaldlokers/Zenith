-- Outreach/cold-contact tracking, distinct from the existing interaction
-- log — this tracks proactive follow-up cadence on a contact even before
-- there's an application tied to them.
ALTER TABLE contacts ADD COLUMN last_contacted_at TEXT;
ALTER TABLE contacts ADD COLUMN follow_up_at TEXT;
ALTER TABLE contacts ADD COLUMN outreach_status TEXT NOT NULL DEFAULT 'not_contacted';
