// The lowest common denominator of every transactional email provider:
// Resend, Postmark, SES, Brevo and plain SMTP all support exactly this.
// Everything past it — tags, configuration sets, message streams, scheduling
// — is where providers diverge, so none of it belongs here. Adding a field
// "for later" is how this seam stops being portable.
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  /** Throws on failure; callers decide whether that is fatal. */
  send(msg: EmailMessage): Promise<void>;
}
