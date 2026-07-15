-- Auto-pulled public info about a company (issue #35)
ALTER TABLE companies ADD COLUMN description TEXT;
ALTER TABLE companies ADD COLUMN logo_url TEXT;
ALTER TABLE companies ADD COLUMN researched_at TEXT;
