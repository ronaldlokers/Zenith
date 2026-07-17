-- Per-user sample-data toggle (#281) — tracks whether the account is
-- currently populated with the example dataset, so the UI can offer
-- "remove sample data" only when it applies.
ALTER TABLE profile ADD COLUMN sample_data_loaded INTEGER NOT NULL DEFAULT 0;
