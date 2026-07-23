// Outreach template composition (#472). Pure so it's unit-testable apart from
// the UI. Bodies hold {{placeholders}} filled from the contact, their company,
// and the user's profile at compose time.

export const TEMPLATE_VARS = [
  "first_name",
  "name",
  "company",
  "role",
  "my_name",
] as const;

export type TemplateVar = (typeof TEMPLATE_VARS)[number];

// Replace every {{var}} whose key is known; leave unknown placeholders intact
// so a typo is visible rather than silently blanked. A known var with no value
// collapses to an empty string (e.g. a contact with no company).
export function fillTemplate(
  body: string,
  vars: Partial<Record<TemplateVar, string | null | undefined>>,
): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    (TEMPLATE_VARS as readonly string[]).includes(key)
      ? (vars[key as TemplateVar] ?? "")
      : whole,
  );
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

// Starter templates offered on an empty template list — inserted into the
// user's own store so they can edit them. `nameKey` is an i18n key; the body
// is provided by the caller already localised (see the composer).
export interface StarterTemplate {
  nameKey: string;
  bodyKey: string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { nameKey: "templates.starters.followUp.name", bodyKey: "templates.starters.followUp.body" },
  { nameKey: "templates.starters.thankYou.name", bodyKey: "templates.starters.thankYou.body" },
  { nameKey: "templates.starters.referral.name", bodyKey: "templates.starters.referral.body" },
  { nameKey: "templates.starters.intro.name", bodyKey: "templates.starters.intro.body" },
];
