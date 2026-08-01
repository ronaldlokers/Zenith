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
    console.error("email send failed", err);
    return false;
  }
}
