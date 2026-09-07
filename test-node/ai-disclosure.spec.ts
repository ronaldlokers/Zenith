import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Privacy is a locked product decision here, and the AI features are the one
// place data leaves the deployment. The settings page carried the only
// disclosure and it named "your CV and the job description" — true of CV
// tailoring, and not of the other three features.
//
// The negotiation roleplay is the one that matters. src/detail.tsx passes
// `salaryExpectation={a.salary_range}` into it, so the compensation stored on
// the application is sent to Anthropic when the panel opens — the user never
// types it, and nothing told them. Compensation is treated as sensitive
// everywhere else in this app: it is the one field the public share page may
// never carry.
//
// So this guards the pairing rather than the wording: while the code sends
// the stored salary, the copy that introduces the feature has to say so, in
// every locale. If the feature stops sending it, this test should be deleted
// along with the sentence — not before.
const ROOT = new URL("..", import.meta.url).pathname;
const LOCALES = ["en", "nl"] as const;

// nl says "salarisbereik"; en says "salary range".
const MENTIONS_PAY = /salary|salaris/i;

function hint(locale: string): string {
  const json = JSON.parse(readFileSync(`${ROOT}src/locales/${locale}.json`, "utf8"));
  return json.negotiation.hint as string;
}

describe("what the AI features disclose", () => {
  it("still sends the stored salary range into the negotiation roleplay", () => {
    // The premise. If this stops being true the assertion below is no longer
    // required, and a guard whose premise has silently gone away is worse
    // than no guard.
    const detail = readFileSync(`${ROOT}src/detail.tsx`, "utf8");
    expect(
      detail,
      "the negotiation panel no longer receives salary_range — recheck whether the disclosure below is still owed",
    ).toMatch(/salaryExpectation=\{a\.salary_range\}/);
  });

  it.each(LOCALES)("says so in %s, where the feature is introduced", (locale) => {
    expect(
      hint(locale),
      `the ${locale} negotiation hint does not mention pay, but the panel sends the application's salary range to Anthropic`,
    ).toMatch(MENTIONS_PAY);
  });

  it.each(LOCALES)("does not still claim CV and job description are all of it in %s", (locale) => {
    // The original sentence enumerated two things as though the list were
    // complete. Four features send four different payloads, so the key hint
    // must not read as an exhaustive list.
    const json = JSON.parse(readFileSync(`${ROOT}src/locales/${locale}.json`, "utf8"));
    const key = json.account.aiKeyHint as string;
    expect(key).toMatch(MENTIONS_PAY);
  });
});
