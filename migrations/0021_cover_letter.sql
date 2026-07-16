-- Manual cover letter builder (#98) — same 1:1, mostly-empty extension
-- pattern as the offer-detail columns: a plain nullable column rather
-- than a join table, since it's always exactly one draft per application.
ALTER TABLE applications ADD COLUMN cover_letter TEXT;
