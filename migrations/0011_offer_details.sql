-- Offer-stage compensation detail (issue #63) — only meaningful once
-- an application reaches "offer", so plain nullable columns rather
-- than a join table keep reads/writes simple for what's effectively
-- a 1:1, mostly-empty extension of applications.
ALTER TABLE applications ADD COLUMN signing_bonus REAL;
ALTER TABLE applications ADD COLUMN bonus_target_pct REAL;
ALTER TABLE applications ADD COLUMN equity_value REAL;
ALTER TABLE applications ADD COLUMN benefits_notes TEXT;
