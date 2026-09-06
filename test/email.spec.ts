import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";
import { logInboundEmail } from "../worker/index";

const BASE = "http://zenith.test";
// The account these tests act as. logInboundEmail now decides whose account a
// message may touch from the SMTP envelope sender, so every call has to say
// who forwarded it.
const OWNER = "ronald@lokers.email";

async function post(path: string, body: unknown) {
  return authedFetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("logInboundEmail", () => {
  it("logs an interaction against the matching contact", async () => {
    const created = await post("/api/contacts", {
      name: "Jane Recruiter",
      email: "Jane@Acme.example",
    });
    const contact = (await created.json()) as { id: number };

    await logInboundEmail(env, "jane@acme.example", "Re: your application", OWNER);

    const res = await authedFetch(`${BASE}/api/contacts/${contact.id}/interactions`);
    const interactions = (await res.json()) as { type: string; notes: string }[];
    expect(interactions).toHaveLength(1);
    expect(interactions[0].type).toBe("email");
    expect(interactions[0].notes).toBe("Re: your application");
  });

  it("flips outreach_status from awaiting_reply to replied", async () => {
    const created = await post("/api/contacts", {
      name: "Bob Hiring Manager",
      email: "bob@example.com",
      outreach_status: "awaiting_reply",
    });
    const contact = (await created.json()) as { id: number };

    await logInboundEmail(env, "bob@example.com", "Following up", OWNER);

    const res = await authedFetch(`${BASE}/api/contacts`);
    const contacts = (await res.json()) as { id: number; outreach_status: string }[];
    const updated = contacts.find((c) => c.id === contact.id);
    expect(updated?.outreach_status).toBe("replied");
  });

  it("does nothing when no contact matches the sender", async () => {
    await expect(
      logInboundEmail(env, "unknown@nowhere.example", "hello", OWNER),
    ).resolves.not.toThrow();
  });
});

// The contact lookup used to run across every user's contacts on the strength
// of a From address alone — and the From of a forwarded message is read out of
// the body, which anyone who can mail the ingest address can write. So a
// stranger could log an interaction against another person's contact, with
// attacker-chosen text, and flip that contact to "replied" so a real follow-up
// stopped being prompted.
describe("who is allowed to write into an account by email", () => {
  it("ignores a message from an address that belongs to no account", async () => {
    const created = await post("/api/contacts", {
      name: "Target Contact",
      email: "target@acme.example",
    });
    const contact = (await created.json()) as { id: number };

    // A stranger forging the recruiter's From and mailing the ingest address.
    await logInboundEmail(
      env,
      "target@acme.example",
      "Great news, please send your bank details",
      "attacker@evil.example",
    );

    const res = await authedFetch(`${BASE}/api/contacts/${contact.id}/interactions`);
    expect(
      (await res.json()) as unknown[],
      "a stranger wrote into someone else's account",
    ).toHaveLength(0);
  });

  it("does not flip a contact to replied on a stranger's say-so", async () => {
    // The quieter half of the same attack, and the more damaging one: the
    // contact stops being chased and nobody notices why.
    const created = await post("/api/contacts", {
      name: "Awaiting Contact",
      email: "awaiting@acme.example",
      outreach_status: "awaiting_reply",
    });
    const contact = (await created.json()) as { id: number };

    await logInboundEmail(env, "awaiting@acme.example", "re: hello", "attacker@evil.example");

    const res = await authedFetch(`${BASE}/api/contacts`);
    const contacts = (await res.json()) as { id: number; outreach_status: string }[];
    expect(
      contacts.find((c) => c.id === contact.id)?.outreach_status,
      "a stranger silenced a real follow-up",
    ).toBe("awaiting_reply");
  });

  it("still logs the forward the feature exists for", async () => {
    // The account holder forwarding a recruiter's mail to themselves, which
    // is what resolveOriginalSender's own comment says this is actually for.
    const created = await post("/api/contacts", {
      name: "Real Recruiter",
      email: "real@acme.example",
    });
    const contact = (await created.json()) as { id: number };

    await logInboundEmail(env, "real@acme.example", "About the role", OWNER);

    const res = await authedFetch(`${BASE}/api/contacts/${contact.id}/interactions`);
    expect((await res.json()) as unknown[]).toHaveLength(1);
  });
});
