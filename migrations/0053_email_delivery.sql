-- Email delivery (#62, #114). Plain ADD COLUMNs — no table rebuild is needed
-- here, unlike 0052's CHECK widening.

-- Email tracks its own delivery rather than reusing pushed_at. One stamp for
-- both channels would mean a provider failure after a successful push leaves
-- the row stamped and the whole morning's batched email silently lost — a
-- failed push loses one notification, a failed batch loses all of them.
ALTER TABLE notifications ADD COLUMN emailed_at TEXT;

-- Which emails the user wants. Default 1 (on) is safe because RESEND_API_KEY
-- is the master switch above these: with no key nothing sends whatever they
-- say, so defaulting on cannot surprise anyone who has not set email up.
ALTER TABLE "user" ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "user" ADD COLUMN email_digest INTEGER NOT NULL DEFAULT 1;
