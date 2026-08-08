-- Hash the public-API key at rest (#381). The key was stored verbatim in
-- profile.api_key, so a DB read handed over live Bearer credentials — and
-- the full export dumps profile with SELECT *, which carried it too.
--
-- SHA-256 is the right primitive here rather than a password KDF: the key
-- is 122 bits of CSPRNG output, so there is no dictionary to grind and no
-- salt to add. The lookup stays a single indexed equality on the digest.
--
-- Dropping the column revokes every existing key. Deliberate: SQLite has
-- no SHA-256, so the digests cannot be backfilled in SQL, and the only
-- alternative was keeping a plaintext fallback path alive indefinitely.
-- Users regenerate from Settings; integrations 401 until they do.
DROP INDEX idx_profile_api_key;
ALTER TABLE profile DROP COLUMN api_key;

ALTER TABLE profile ADD COLUMN api_key_hash TEXT;
-- Last 4 characters of the key, so Settings can identify which key a tool
-- is holding once the key itself is unreadable. Same shape as the BYO
-- Anthropic key's hint (worker/ai.ts).
ALTER TABLE profile ADD COLUMN api_key_hint TEXT;
ALTER TABLE profile ADD COLUMN api_key_created_at TEXT;

-- NULLs are all distinct under a SQLite unique index, so users without a
-- key don't collide.
CREATE UNIQUE INDEX idx_profile_api_key_hash ON profile(api_key_hash);
