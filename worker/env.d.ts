// Secrets set via `wrangler secret put` — not present in wrangler.jsonc,
// so `wrangler types` can't generate them. Optional: Adzuna ingestion is
// skipped gracefully when unset (see worker/feed.ts).
interface Env {
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
}
