-- Quick 1-5 self-rating to help prioritize which follow-ups matter most
-- when several are due the same day.
ALTER TABLE applications ADD COLUMN fit_score INTEGER;
