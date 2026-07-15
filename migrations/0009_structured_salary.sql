-- Structured salary fields for cross-application comparison (issue #36).
-- salary_range stays as free text for display/export/feed data;
-- these fields power the Stats comparison table.
ALTER TABLE applications ADD COLUMN salary_currency TEXT;
ALTER TABLE applications ADD COLUMN salary_min INTEGER;
ALTER TABLE applications ADD COLUMN salary_max INTEGER;
ALTER TABLE applications ADD COLUMN salary_period TEXT
    CHECK (salary_period IS NULL OR salary_period IN ('year', 'month'));
