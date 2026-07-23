-- Better Auth database-backed rate limiting (security review, #445).
--
-- Better Auth only auto-enables rate limiting when NODE_ENV === "production",
-- which the deployed Worker never sets — so login and 2FA verification
-- accepted unlimited attempts. worker/auth.ts now enables it explicitly with
-- storage "database" (memory storage wouldn't survive across Workers
-- isolates). This is the table that store reads/writes; the shape matches
-- Better Auth's rateLimit model (id/key/count/lastRequest).
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" INTEGER NOT NULL
);

CREATE INDEX idx_rate_limit_key ON "rateLimit" ("key");
