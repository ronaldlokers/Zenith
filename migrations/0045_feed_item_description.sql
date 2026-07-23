-- Capture the job description from feed providers (Greenhouse/Ashby full,
-- Adzuna snippet). Carried into an application's job_description on Add-to-Jobs.
ALTER TABLE feed_items ADD COLUMN description TEXT;
