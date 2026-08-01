import { describe, expect, it } from "vitest";
import { buildDigestEmail, buildReminderEmail } from "../worker/email/messages";

const TO = "someone@example.com";

describe("buildReminderEmail", () => {
  const items = [
    { kind: "due" as const, title: "DevOps Engineer", body: "Lumen Robotics" },
    { kind: "due" as const, title: "Front-end Engineer", body: "Solace Systems" },
    { kind: "upcoming" as const, title: "Ada Lovelace", body: "Recruiter" },
  ];

  it("counts only what needs action today in the subject", () => {
    const msg = buildReminderEmail(TO, "en", items);
    expect(msg.subject).toContain("2");
    expect(msg.to).toBe(TO);
  });

  it("separates today from tomorrow in both html and text", () => {
    const msg = buildReminderEmail(TO, "en", items);
    for (const part of [msg.html, msg.text]) {
      expect(part).toContain("DevOps Engineer");
      expect(part).toContain("Ada Lovelace");
    }
    // The two groups must be distinguishable, or a heads-up reads as due now.
    expect(msg.text.indexOf("DevOps Engineer")).toBeLessThan(
      msg.text.indexOf("Ada Lovelace"),
    );
  });

  it("localizes to nl", () => {
    const en = buildReminderEmail(TO, "en", items);
    const nl = buildReminderEmail(TO, "nl", items);
    expect(nl.subject).not.toBe(en.subject);
  });

  it("falls back to en for an unknown locale", () => {
    const en = buildReminderEmail(TO, "en", items);
    expect(buildReminderEmail(TO, "de", items).subject).toBe(en.subject);
  });

  // An email whose text part is empty lands in spam far more often, and some
  // clients render nothing at all.
  it("always produces a non-empty text alternative", () => {
    expect(buildReminderEmail(TO, "en", items).text.trim().length).toBeGreaterThan(0);
  });

  it("escapes html in user-supplied titles", () => {
    const msg = buildReminderEmail(TO, "en", [
      { kind: "due", title: "<script>alert(1)</script>", body: null },
    ]);
    expect(msg.html).not.toContain("<script>");
  });
});

describe("buildDigestEmail", () => {
  it("carries the already-localized title and body it is given", () => {
    const msg = buildDigestEmail(TO, "Your week on Zenith", "4 added · 2 advanced");
    expect(msg.subject).toBe("Your week on Zenith");
    expect(msg.text).toContain("4 added");
    expect(msg.html).toContain("4 added");
  });
});
