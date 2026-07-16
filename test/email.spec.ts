import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";
import { logInboundEmail } from "../worker/index";

const BASE = "http://jobseekr.test";

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

    await logInboundEmail(env, "jane@acme.example", "Re: your application");

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

    await logInboundEmail(env, "bob@example.com", "Following up");

    const res = await authedFetch(`${BASE}/api/contacts`);
    const contacts = (await res.json()) as { id: number; outreach_status: string }[];
    const updated = contacts.find((c) => c.id === contact.id);
    expect(updated?.outreach_status).toBe("replied");
  });

  it("does nothing when no contact matches the sender", async () => {
    await expect(
      logInboundEmail(env, "unknown@nowhere.example", "hello"),
    ).resolves.not.toThrow();
  });
});
