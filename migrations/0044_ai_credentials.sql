-- BYO Claude API key: one Anthropic API key per user, encrypted at rest with
-- AES-GCM (master key AI_KEY_ENCRYPTION_KEY). The key is write-only — never
-- returned to the client. `hint` holds the last 4 chars for display; `iv` is
-- the per-write nonce.
CREATE TABLE ai_credentials (
    user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    hint TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
