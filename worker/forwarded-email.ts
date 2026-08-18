import PostalMime from "postal-mime";

// Who actually wrote the mail (#179).
//
// Inbound logging matched contacts on the SMTP envelope From. That is right
// for a recruiter mailing the logging address directly, and wrong for the way
// it is actually used: forwarding a recruiter's mail, where the envelope From
// is the forwarder — you. The result was an interaction logged against your
// own contact record, or against nobody.
//
// The original sender does not survive in the envelope or the top-level
// headers of a forward. It survives in the body, in one of two shapes:
//
//  1. A "forward as attachment" carries the original as a nested
//     message/rfc822 part with its own real headers. Parsed, not guessed.
//  2. The Forward button in Gmail and Outlook quotes the original as text,
//     under a boilerplate block. That has to be read out of the quoted text,
//     which is less reliable — the wording varies by client and locale — but
//     it is what most forwards actually are.
//
// Ordered by confidence, and the envelope remains the answer when neither
// shape is found, so a direct mail behaves exactly as before.
export type SenderSource = "envelope" | "attached" | "quoted";

export interface ResolvedSender {
  address: string;
  source: SenderSource;
}

/** An address out of a `From:` line, with or without a display name. */
const FROM_LINE =
  /^\s*(?:from|van|de|von)\s*:\s*(?:[^<\n]*<\s*([^>\s]+@[^>\s]+?)\s*>|([^\s<>@]+@[^\s<>]+))/im;

// Gmail writes a marker line; Outlook writes a From/Sent/To/Subject block with
// no marker at all. Anchoring on the marker where there is one keeps a From:
// that merely appears in a signature from being read as the sender.
const FORWARD_MARKERS = [
  /-{2,}\s*Forwarded message\s*-{2,}/i,
  /-{2,}\s*Original Message\s*-{2,}/i,
  /-{2,}\s*Doorgestuurd bericht\s*-{2,}/i,
  /^\s*Begin forwarded message:/im,
];

function fromQuotedBody(text: string | undefined): string | null {
  if (!text) return null;
  for (const marker of FORWARD_MARKERS) {
    const at = text.search(marker);
    if (at === -1) continue;
    const after = text.slice(at);
    const m = after.match(FROM_LINE);
    const found = m?.[1] ?? m?.[2];
    if (found) return found.toLowerCase();
  }
  // Outlook's inline forward has no marker: it opens the quoted block with
  // From:, and the Sent:/To: lines under it are what distinguish that from a
  // stray From: in a signature.
  const outlook = text.match(
    /^\s*(?:from|van)\s*:\s*(?:[^<\n]*<\s*([^>\s]+@[^>\s]+?)\s*>|([^\s<>@]+@[^\s<>]+))[\s\S]{0,200}?^\s*(?:sent|date|verzonden)\s*:/im,
  );
  const found = outlook?.[1] ?? outlook?.[2];
  return found ? found.toLowerCase() : null;
}

export async function resolveOriginalSender(
  raw: Parameters<typeof PostalMime.parse>[0],
  envelopeFrom: string,
): Promise<ResolvedSender> {
  const envelope: ResolvedSender = {
    address: envelopeFrom.toLowerCase(),
    source: "envelope",
  };
  try {
    // forceRfc822Attachments, so a nested original arrives as bytes to parse
    // rather than being flattened into this message's text — the flattened
    // form loses the headers that make case 1 reliable.
    const mail = await PostalMime.parse(raw, { forceRfc822Attachments: true });

    const attached = mail.attachments?.find(
      (a) => a.mimeType?.toLowerCase() === "message/rfc822",
    );
    if (attached) {
      const inner = await PostalMime.parse(
        attached.content as ArrayBuffer | string,
      );
      const address = inner.from?.address;
      if (address) return { address: address.toLowerCase(), source: "attached" };
    }

    const quoted = fromQuotedBody(mail.text);
    if (quoted) return { address: quoted, source: "quoted" };

    // A message that parsed but is not a forward: prefer its own parsed From
    // over the envelope, which can be a bounce or list address.
    const own = mail.from?.address;
    if (own) return { address: own.toLowerCase(), source: "envelope" };
  } catch {
    // A message that will not parse is not a reason to drop the log entirely.
    // The envelope is worse but it is what the handler had before this.
  }
  return envelope;
}
