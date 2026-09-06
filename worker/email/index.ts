import { resendProvider } from "./providers/resend.js";
import type { EmailMessage, EmailProvider } from "./types.js";

export type { EmailMessage, EmailProvider } from "./types.js";

const DEFAULT_FROM = "Zenith <zenith@zenith.lokilabs.nl>";

/**
 * One branch, not a registry — there is one provider. The seam exists because
 * providers in this space disappear (MailChannels terminated the free Workers
 * API this app would have used, on about sixty days' notice), not because a
 * second one is planned.
 */
export function resolveProvider(env: Env): EmailProvider | null {
  if (!env.RESEND_API_KEY) return null;
  return resendProvider(env.RESEND_API_KEY, env.EMAIL_FROM ?? DEFAULT_FROM);
}

/**
 * Best-effort send. Returns whether it sent, and never throws: the delivery
 * pass runs for every user in one loop, and one bad address must not stop the
 * rest. The admin test-send calls the provider directly instead, because it
 * needs the error.
 */
export async function sendEmail(env: Env, msg: EmailMessage): Promise<boolean> {
  const provider = resolveProvider(env);
  if (!provider) return false;
  try {
    await provider.send(msg);
    return true;
  } catch (err) {
    // Not the whole error. Observability is on, so this line is retained in
    // Cloudflare's log platform, outside this app's data boundary — and the
    // provider's error body can quote the address it rejected, which would
    // put a user's email address there.
    //
    // The status is what has diagnostic value ("422" against "500" is the
    // question a log answers); the body is where the address is. The thrown
    // Error keeps both, because the admin test-send calls the provider
    // directly to show its real words — redacting at the throw site would
    // have taken that away too.
    console.error("email send failed", summarizeSendError(err));
    return false;
  }
}

/**
 * A one-line, non-identifying description of a provider failure.
 *
 * Providers throw `<name> <status>: <body>`; the body is dropped. Anything
 * else — a network error, a thrown string — is reported by shape rather than
 * content, since an unrecognised message is exactly the one whose contents
 * cannot be vouched for.
 */
export function summarizeSendError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const provider = message.match(/^([a-z]+) (\d{3}):/i);
  if (provider) return `${provider[1]} responded ${provider[2]}`;
  return err instanceof Error ? `${err.name} (message withheld)` : "non-error thrown";
}
