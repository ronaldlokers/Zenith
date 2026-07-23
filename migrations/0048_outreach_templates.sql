-- Reusable outreach message templates (#472) — follow-ups, thank-yous,
-- referral asks. Bodies hold {{placeholders}} filled from the contact,
-- their company, and the user's profile when composing.
CREATE TABLE outreach_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_outreach_templates_user ON outreach_templates(user_id);
