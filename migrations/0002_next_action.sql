-- Follow-up reminders: what to do next and when
ALTER TABLE applications ADD COLUMN next_action TEXT;
ALTER TABLE applications ADD COLUMN next_action_at TEXT;
