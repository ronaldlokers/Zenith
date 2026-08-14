import type { EmailMessage, EmailProvider } from "../types.js";

const ENDPOINT = "https://api.resend.com/emails";

export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    async send(msg: EmailMessage): Promise<void> {
      // Open and click tracking are domain-level settings in the Resend
      // dashboard, not per-request fields — there is no flag here that could
      // disable them. Verify they're off there, not by reading this code.
      // Reminders and the digest send from a cron. An unanswered call there
      // stalls the whole run, and nobody is watching it.
      const res = await fetch(ENDPOINT, {
        signal: AbortSignal.timeout(15_000),
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
      });
      if (!res.ok) {
        // Surface the provider's own words: the admin test-send shows this,
        // and "domain not verified" vs "bad key" are different problems.
        throw new Error(`resend ${res.status}: ${await res.text()}`);
      }
    },
  };
}
