// Secrets set via `wrangler secret put` — not present in wrangler.jsonc,
// so `wrangler types` can't generate them. Optional: Adzuna ingestion is
// skipped gracefully when unset (see worker/feed.ts).
interface Env {
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  // Web Push (#214) — generated locally via scripts/generate-vapid-keys.mjs,
  // not an account/signup with any provider. Push is skipped gracefully
  // when unset (see worker/push.ts).
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  // AES-256 master key (base64 32 bytes) for encrypting users' own Anthropic
  // API keys at rest (BYO Claude key). BYO-key endpoints 503 gracefully when
  // unset; the rest of the app is unaffected.
  AI_KEY_ENCRYPTION_KEY?: string;
}
