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
  },
  nl: {
    reminderSubjectOne: "1 follow-up heeft vandaag aandacht nodig",
    reminderSubjectMany: "{{count}} follow-ups hebben vandaag aandacht nodig",
    reminderSubjectNone: "Jouw Zenith-herinneringen",
    dueHeading: "Vandaag",
    upcomingHeading: "Morgen op de planning",
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
// present), so the system stack. Sizes are literal `rem` values pulled
// straight off DESIGN.md's typography ramp for the same reason the colours
// are — real steps, not invented ones: 0.875rem (--text-body), 0.75rem
// (--text-meta), 1.375rem (--text-headline).
const FONT_STACK = "system-ui, -apple-system, sans-serif";

// Inline-styled, no <style> block or external stylesheet — email clients are
// not browsers.
function wrapHtml(bodyHtml: string): string {
  return `<div style="background:${BG};padding:24px 16px;"><div style="font-family:${FONT_STACK};font-size:0.875rem;line-height:1.5;color:${INK};max-width:520px;margin:0 auto;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;padding:24px;">${bodyHtml}</div></div>`;
}

function itemHtml(item: ReminderItem): string {
  const title = escapeHtml(item.title);
  const body = item.body ? escapeHtml(item.body) : "";
  return `<div style="padding:10px 0;border-bottom:1px solid ${BORDER};"><div style="font-weight:600;">${title}</div>${body ? `<div style="color:${MUTED};font-size:0.75rem;">${body}</div>` : ""}</div>`;
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
  return `<h2 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:${color};margin:20px 0 8px;">${escapeHtml(heading)}</h2>${rows}`;
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
  );
  const text = [groupText(s.dueHeading, due), groupText(s.upcomingHeading, upcoming)]
    .filter(Boolean)
    .join("\n\n");

  return { to, subject, html, text };
}

/**
 * No locale parameter: the digest's title and body are already localized
 * worker-generated prose (see digest.ts's STRINGS + fill), so this carries
 * them through unchanged rather than localizing again.
 */
export function buildDigestEmail(
  to: string,
  title: string,
  body: string,
): EmailMessage {
  const html = wrapHtml(
    `<h1 style="font-size:1.375rem;margin:0 0 12px;">${escapeHtml(title)}</h1><p style="margin:0;">${escapeHtml(body)}</p>`,
  );
  const text = `${title}\n\n${body}`;

  return { to, subject: title, html, text };
}
