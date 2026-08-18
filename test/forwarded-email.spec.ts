import { describe, expect, it } from "vitest";
import { resolveOriginalSender } from "../worker/forwarded-email";

// #179. The envelope From on a forward is the forwarder -- you -- so matching
// contacts on it logged the interaction against your own record, or none.
// These are the shapes a forward actually arrives in.
const YOU = "ronald@lokilabs.nl";
const RECRUITER = "sam.okafor@northwind.example";

/** Mail is CRLF on the wire; a parser is entitled to expect it. */
const crlf = (s: string) => s.trimStart().replace(/\n/g, "\r\n");

const gmailForward = crlf(`
From: Ronald <${YOU}>
To: logger@zenith.example
Subject: Fwd: Platform Engineer role
Content-Type: text/plain; charset="utf-8"

Worth a look.

---------- Forwarded message ---------
From: Sam Okafor <${RECRUITER}>
Date: Mon, 10 Aug 2026 at 09:14
Subject: Platform Engineer role
To: Ronald <${YOU}>

Hello, are you open to a conversation?
`);

const outlookForward = crlf(`
From: Ronald <${YOU}>
To: logger@zenith.example
Subject: FW: Platform Engineer role
Content-Type: text/plain; charset="utf-8"

Passing this on.

From: Sam Okafor <${RECRUITER}>
Sent: Monday, 10 August 2026 09:14
To: Ronald <${YOU}>
Subject: Platform Engineer role

Hello, are you open to a conversation?
`);

const attachedForward = crlf(`
From: Ronald <${YOU}>
To: logger@zenith.example
Subject: Fwd: Platform Engineer role
Content-Type: multipart/mixed; boundary="outer"

--outer
Content-Type: text/plain; charset="utf-8"

See attached.

--outer
Content-Type: message/rfc822

From: Sam Okafor <${RECRUITER}>
To: Ronald <${YOU}>
Subject: Platform Engineer role

Hello, are you open to a conversation?

--outer--
`);

const direct = crlf(`
From: Sam Okafor <${RECRUITER}>
To: logger@zenith.example
Subject: Platform Engineer role
Content-Type: text/plain; charset="utf-8"

Hello, are you open to a conversation?
`);

describe("who actually wrote a forwarded email", () => {
  it("reads the real sender out of an attached original", async () => {
    // The reliable shape: the original is a nested message carrying its own
    // headers, so nothing is guessed.
    const r = await resolveOriginalSender(attachedForward, YOU);
    expect(r).toEqual({ address: RECRUITER, source: "attached" });
  });

  it("reads it out of a Gmail inline forward", async () => {
    const r = await resolveOriginalSender(gmailForward, YOU);
    expect(r).toEqual({ address: RECRUITER, source: "quoted" });
  });

  it("reads it out of an Outlook inline forward, which has no marker line", async () => {
    // Outlook opens the quoted block with From: and no boilerplate marker.
    // The Sent:/To: lines under it are what separate that from a From: in a
    // signature.
    const r = await resolveOriginalSender(outlookForward, YOU);
    expect(r).toEqual({ address: RECRUITER, source: "quoted" });
  });

  it("leaves a direct email alone", async () => {
    // The case that already worked has to keep working: a recruiter mailing
    // the logging address directly is not a forward.
    const r = await resolveOriginalSender(direct, RECRUITER);
    expect(r.address).toBe(RECRUITER);
  });

  it("does not read a bare quoted From: as the sender", async () => {
    // A From: line at the start of a line, with no forward marker above it
    // and no Sent:/Date: under it — someone pasting part of an email, or a
    // footer that happens to be shaped that way.
    //
    // This is what the marker and Sent: anchors are for. Without them any
    // quoted From: wins, and logging an interaction against a name lifted out
    // of a footer is worse than logging it against the forwarder, because it
    // looks right.
    const pasted = crlf(`
From: Ronald <${YOU}>
To: logger@zenith.example
Subject: A note
Content-Type: text/plain; charset="utf-8"

Reminder to self, from an old thread:

From: old-colleague@elsewhere.example
Anyway, worth a look one day.
`);
    const r = await resolveOriginalSender(pasted, YOU);
    expect(
      r.address,
      "a From: with neither a marker above it nor a Sent: under it was read as the sender",
    ).toBe(YOU);
    expect(r.source).toBe("envelope");
  });

  it("falls back to the envelope when the message will not parse", async () => {
    // A log against the forwarder is poor. No log at all, or a handler that
    // throws, is worse.
    const r = await resolveOriginalSender(" not a message", YOU);
    expect(r.address).toBe(YOU);
  });
});
