-- Multiple interviewers per round (#220) — a free-text list (comma-
-- separated names/roles) on the interaction itself, same lightweight
-- pattern as tags rather than a many-to-many join against contacts;
-- interviewers on a panel round are frequently people who never become
-- a tracked Contact record.
ALTER TABLE interactions ADD COLUMN interviewers TEXT;
