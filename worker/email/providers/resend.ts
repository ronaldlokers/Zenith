import type { EmailMessage, EmailProvider } from "../types.js";

const ENDPOINT = "https://api.resend.com/emails";

export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    async send(msg: EmailMessage): Promise<void> {
      const res = await fetch(ENDPOINT, {
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
