-- TOTP-based 2FA (#211), via Better-Auth's two-factor plugin.
-- Generated via `@better-auth/cli generate` against this exact plugin
-- config (emailAndPassword + admin + twoFactor), then hand-copied here
-- for D1 — same process as 0023_better_auth.sql.

ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" INTEGER;

CREATE TABLE "twoFactor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "verified" INTEGER,
    "failedVerificationCount" INTEGER,
    "lockedUntil" DATE
);

CREATE INDEX "twoFactor_secret_idx" ON "twoFactor" ("secret");
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" ("userId");
