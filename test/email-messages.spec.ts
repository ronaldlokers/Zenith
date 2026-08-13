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

describe("email markup constraints", () => {
  // An email is not a browser document. These two were written the way the
  // app writes CSS, which is the natural mistake and the one this pins.
  const reminder = buildReminderEmail("a@b.test", "en", [
    { kind: "due", title: "Follow up", body: "Vantage Digital" },
  ]);
  const digest = buildDigestEmail("a@b.test", "Your week", "4 added", "nl");

  it("sizes type in px, never rem", () => {
    // rem resolves against a root the email does not control: Outlook's Word
    // engine does not support the unit at all, and a client that rewraps the
    // HTML into its own document resolves it against theirs. The sizes are
    // still DESIGN.md's ramp — 14/12/22 against its 16px root — just stated
    // in the one unit every client agrees on.
    for (const msg of [reminder, digest]) {
      expect(msg.html, "rem in an email stylesheet").not.toMatch(
        /font-size:\s*[\d.]+rem/,
      );
      expect(msg.html).toMatch(/font-size:\s*\d+px/);
    }
  });

  it("keeps every style inline", () => {
    // Gmail strips <style> blocks; inline is the only reliable channel.
    for (const msg of [reminder, digest]) {
      expect(msg.html).not.toMatch(/<style\b/i);
      expect(msg.html).not.toMatch(/<link\b/i);
    }
  });

  it("declares the language of the prose it carries", () => {
    // So a mail client's screen reader announces a Dutch reminder in Dutch.
    expect(reminder.html).toMatch(/lang="en"/);
    expect(digest.html, "the digest is handed already-localized prose").toMatch(
      /lang="nl"/,
    );
  });

  it("stays far under Gmail's 102KB clipping threshold", () => {
    // Clipping hides the end of the message. Nothing here is close, which is
    // the point: this fails only if someone starts embedding.
    for (const msg of [reminder, digest]) {
      expect(new TextEncoder().encode(msg.html).length).toBeLessThan(102 * 1024);
    }
  });
});
