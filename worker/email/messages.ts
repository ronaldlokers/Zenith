import type { EmailMessage } from "./types.js";

// Content generation for reminder and digest emails. Kept independent of
// ./providers — it must not know who sends the message, and the provider
// must not know what it is sending. That split is what lets a provider swap
// touch one file under providers/ instead of also touching copy and locale
// handling.
//
// Copy lives here (not src/locales) for the same reason as worker/digest.ts:
// tsconfig.worker.json excludes src, so the worker cannot import the app's
// locale files. Both keys are held in sync in this one map.
const STRINGS = {
  en: {
    reminderSubjectOne: "1 follow-up needs you today",
    reminderSubjectMany: "{{count}} follow-ups need you today",
    reminderSubjectNone: "Your Zenith reminders",
    dueHeading: "Due today",
    upcomingHeading: "Coming up tomorrow",
    resetSubject: "Reset your Zenith password",
    resetHeading: "Reset your password",
    resetBody:
      "Someone asked to reset the password on this Zenith account. If that was you, choose a new one:",
    resetCta: "Choose a new password",
    resetIgnore:
      "The link works once and expires in an hour. If you did not ask for this, ignore this email — nothing has changed.",
    twoFactorResetSubject: "Your two-factor authentication was reset",
    twoFactorResetHeading: "Two-factor authentication reset",
    twoFactorResetBody:
      "An administrator reset the two-factor authentication on your Zenith account. You can sign in with just your password until you set it up again.",
  },
  nl: {
    reminderSubjectOne: "1 follow-up heeft vandaag aandacht nodig",
    reminderSubjectMany: "{{count}} follow-ups hebben vandaag aandacht nodig",
    reminderSubjectNone: "Jouw Zenith-herinneringen",
    dueHeading: "Vandaag",
    upcomingHeading: "Morgen op de planning",
    resetSubject: "Stel je Zenith-wachtwoord opnieuw in",
    resetHeading: "Wachtwoord opnieuw instellen",
    resetBody:
      "Iemand vroeg om het wachtwoord van dit Zenith-account opnieuw in te stellen. Was jij dat, kies dan een nieuw wachtwoord:",
    resetCta: "Kies een nieuw wachtwoord",
    resetIgnore:
      "De link werkt één keer en verloopt na een uur. Heb je dit niet aangevraagd, negeer deze e-mail dan — er is niets veranderd.",
    twoFactorResetSubject: "Je tweestapsverificatie is opnieuw ingesteld",
    twoFactorResetHeading: "Tweestapsverificatie opnieuw ingesteld",
    twoFactorResetBody:
      "Een beheerder heeft de tweestapsverificatie van je Zenith-account opnieuw ingesteld. Je kunt inloggen met alleen je wachtwoord totdat je die opnieuw instelt.",
  },
} as const;

type Locale = keyof typeof STRINGS;

function resolveLocale(locale: string): Locale {
  return locale in STRINGS ? (locale as Locale) : "en";
}

function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ""));
}

// Titles and bodies are user-supplied (typed by the user, or scraped from a
// job board), so every interpolated value in the HTML part must go through
// this before reaching the markup.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ReminderItem {
  kind: "due" | "upcoming";
  title: string;
  body: string | null;
}

// This worker builds standalone HTML email bodies with no access to
// src/index.css — email clients can't resolve CSS custom properties, so
// var(--ink) etc. is not an option here. That makes literals necessary, but
// it does not make them a free choice: these are the REAL light-theme token
// values (an email is a light document, unlike the Night-ground rail), named
// here so a drift toward an invented grey registers on sight instead of
// looking like just another hex.
//   #14173a --ink      body text
//   #5c5f76 --muted    secondary lines, the footer
//   #e7e4db --border   rules and separators
//   #ffffff --surface  the card ground
//   #f4f2ec --bg       the page ground behind it
//   #d6a441 --accent   Struck Brass — the one thing that carries the eye,
//                      spent once per email, never for decoration
const INK = "#14173a";
const MUTED = "#5c5f76";
const BORDER = "#e7e4db";
const SURFACE = "#ffffff";
const BG = "#f4f2ec";
const ACCENT = "#d6a441";

// Font stack and sizes: no web font (email clients don't reliably load
// them, and DESIGN.md's Atkinson Hyperlegible Next isn't guaranteed
// present), so the system stack.
//
// Sizes are DESIGN.md's ramp expressed in px, and the unit is the point.
// They were `rem`, on the reasoning that real ramp steps beat invented
// numbers — right about which sizes, wrong about the unit for this medium.
// `rem` resolves against the root font size, and an email has no root it
// controls: Outlook's Word rendering engine does not support the unit at
// all, and clients that rewrap the HTML into their own document resolve it
// against theirs. The ramp survives, stated in the one unit every client
// agrees on, against the 16px root the ramp is defined from.
const TEXT_BODY = "14px"; // 0.875rem --text-body
const TEXT_META = "12px"; // 0.75rem  --text-meta
const TEXT_HEADING = "22px"; // 1.375rem --text-heading
const FONT_STACK = "system-ui, -apple-system, sans-serif";

// Inline-styled, no <style> block or external stylesheet — email clients are
// not browsers.
// `lang` so a screen reader in a mail client reads a Dutch reminder in
// Dutch. The app sets it on the document; an email fragment has to carry it
// itself, and this product sends every message in one of two languages.
function wrapHtml(bodyHtml: string, locale: Locale): string {
  return `<div lang="${locale}" style="background:${BG};padding:24px 16px;"><div style="font-family:${FONT_STACK};font-size:${TEXT_BODY};line-height:1.5;color:${INK};max-width:520px;margin:0 auto;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;padding:24px;">${bodyHtml}</div></div>`;
}

function itemHtml(item: ReminderItem): string {
  const title = escapeHtml(item.title);
  const body = item.body ? escapeHtml(item.body) : "";
  return `<div style="padding:10px 0;border-bottom:1px solid ${BORDER};"><div style="font-weight:600;">${title}</div>${body ? `<div style="color:${MUTED};font-size:${TEXT_META};">${body}</div>` : ""}</div>`;
}

function itemText(item: ReminderItem): string {
  return item.body ? `- ${item.title} (${item.body})` : `- ${item.title}`;
}

// `accent` is true only for the "due today" heading — the one thing in this
// email that needs to carry the eye. Every other heading stays muted, per
// DESIGN.md's One Gold Rule: brass is spent once, not as decoration.
function groupHtml(heading: string, items: ReminderItem[], accent: boolean): string {
  if (items.length === 0) return "";
  const rows = items.map(itemHtml).join("");
  const color = accent ? ACCENT : MUTED;
  return `<h2 style="font-size:${TEXT_META};text-transform:uppercase;letter-spacing:0.06em;color:${color};margin:20px 0 8px;">${escapeHtml(heading)}</h2>${rows}`;
}

function groupText(heading: string, items: ReminderItem[]): string {
  if (items.length === 0) return "";
  return `${heading}\n${items.map(itemText).join("\n")}`;
}

/**
 * `items` is ordered due-then-upcoming by the caller-visible grouping below;
 * the split is by kind, not by input order, so a mixed list still renders
 * "due" ahead of "upcoming".
 */
export function buildReminderEmail(
  to: string,
  locale: string,
  items: ReminderItem[],
): EmailMessage {
  const s = STRINGS[resolveLocale(locale)];
  const due = items.filter((item) => item.kind === "due");
  const upcoming = items.filter((item) => item.kind === "upcoming");

  // Only what needs action today belongs in the subject — a heads-up for
  // tomorrow is not due today, and counting it would be a small lie the user
  // eventually notices.
  const subject =
    due.length === 0
      ? s.reminderSubjectNone
      : due.length === 1
        ? s.reminderSubjectOne
        : fill(s.reminderSubjectMany, { count: due.length });

  const html = wrapHtml(
    groupHtml(s.dueHeading, due, true) + groupHtml(s.upcomingHeading, upcoming, false),
    resolveLocale(locale),
  );
  const text = [groupText(s.dueHeading, due), groupText(s.upcomingHeading, upcoming)]
    .filter(Boolean)
    .join("\n\n");

  return { to, subject, html, text };
}

/**
 * The title and body are already localized worker-generated prose (see
 * digest.ts's STRINGS + fill), so this still carries them through unchanged
 * rather than localizing again. `locale` is not a second localization pass —
 * it only declares, on the markup, which language that prose is already in,
 * so a screen reader announces it correctly.
 */
export function buildDigestEmail(
  to: string,
  title: string,
  body: string,
  locale = "en",
): EmailMessage {
  const html = wrapHtml(
    `<h1 style="font-size:${TEXT_HEADING};margin:0 0 12px;">${escapeHtml(title)}</h1><p style="margin:0;">${escapeHtml(body)}</p>`,
    resolveLocale(locale),
  );
  const text = `${title}\n\n${body}`;

  return { to, subject: title, html, text };
}

/**
 * The password-reset email.
 *
 * The URL is generated by Better Auth and is a one-time token, so it is the
 * one thing in this message that must not be mangled — it goes through
 * escapeHtml like every other interpolation, and appears in the text part
 * verbatim so a client that strips HTML still shows something clickable.
 *
 * No user-supplied content anywhere: the account holder's own name is
 * deliberately left out. This is the one email that gets sent to an address
 * on the say-so of whoever typed it into the form, so it should reveal as
 * little about the account as possible.
 */
export function buildPasswordResetEmail(
  to: string,
  locale: string,
  url: string,
): EmailMessage {
  const s = STRINGS[resolveLocale(locale)];
  const safeUrl = escapeHtml(url);
  const html = wrapHtml(
    `<h1 style="font-size:${TEXT_BODY};margin:0 0 12px;">${escapeHtml(s.resetHeading)}</h1>` +
      `<p style="margin:0 0 16px;">${escapeHtml(s.resetBody)}</p>` +
      `<p style="margin:0 0 16px;"><a href="${safeUrl}" style="color:${ACCENT};font-weight:600;">${escapeHtml(s.resetCta)}</a></p>` +
      `<p style="color:${MUTED};font-size:${TEXT_META};margin:0;">${escapeHtml(s.resetIgnore)}</p>`,
    resolveLocale(locale),
  );
  const text = `${s.resetHeading}\n\n${s.resetBody}\n\n${url}\n\n${s.resetIgnore}`;
  return { to, subject: s.resetSubject, html, text };
}

/**
 * Notice sent when an admin resets a user's two-factor authentication
 * (security review — this used to happen with no trace at all). No link, no
 * token: unlike the password reset this carries nothing sensitive to
 * protect, just a plain statement that it happened.
 */
export function buildTwoFactorResetEmail(to: string, locale: string): EmailMessage {
  const s = STRINGS[resolveLocale(locale)];
  const html = wrapHtml(
    `<h1 style="font-size:${TEXT_BODY};margin:0 0 12px;">${escapeHtml(s.twoFactorResetHeading)}</h1>` +
      `<p style="margin:0;">${escapeHtml(s.twoFactorResetBody)}</p>`,
    resolveLocale(locale),
  );
  const text = `${s.twoFactorResetHeading}\n\n${s.twoFactorResetBody}`;
  return { to, subject: s.twoFactorResetSubject, html, text };
}
