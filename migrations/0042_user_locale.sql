-- Persist the user's UI language server-side so worker-generated content (the
-- weekly digest, etc.) can be localized. UI language still lives in
-- localStorage and drives the switch; this mirrors it. NULL means "not set",
-- which the worker treats as 'en'.
ALTER TABLE "user" ADD COLUMN locale TEXT;
