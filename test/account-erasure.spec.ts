import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Deleting an account wiped every row and left the files. The documents rows
// are only pointers — the CVs and cover letters live in R2, and nothing in
// the wipe touched it. Measured: upload 201, delete 204, and
// "app-1/1786676401088-cv.pdf" still in the bucket afterwards, beyond reach,
// because the rows that named the keys were the only way to find them.
//
// For an app that treats privacy as a feature, "delete my account" has to
// mean the files too.
//
// Own file, like account-delete.spec.ts: deleting the account removes the
// seed-admin user the rest of a file depends on, and vitest-pool-workers
// isolates storage per file rather than per test — so a second test here
// would run with no user at all.
const WHOLE_ACCOUNT = 20_000;
const BASE = "http://zenith.test";

async function seedApplication(): Promise<number> {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Platform Engineer", role_type: "other" }),
  });
  return ((await res.json()) as { id: number }).id;
}

async function upload(appId: number, filename: string): Promise<void> {
  const content = "cv bytes";
  const res = await authedFetch(
    `${BASE}/api/applications/${appId}/documents?filename=${filename}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(content.length),
      },
      body: content,
    },
  );
  expect(res.status).toBe(201);
}

describe("erasing an account", () => {
  it("takes the stored files with it, not just the rows", async () => {
    const appId = await seedApplication();
    await upload(appId, "cv.pdf");
    await upload(appId, "cover-letter.pdf");

    // Someone else's document, written straight to the tables and the bucket:
    // it must survive, and it is the direction that would be expensive to get
    // wrong — a wipe that over-reached would erase another account's files.
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
    )
      .bind("someone-else", "Someone Else", "someone@example.com")
      .run();
    await env.DOCS.put("app-999/other-user.pdf", "not mine");
    await env.DB.prepare(
      `INSERT INTO documents (application_id, user_id, key, filename, size)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(appId, "someone-else", "app-999/other-user.pdf", "other.pdf", 8)
      .run();

    expect((await env.DOCS.list()).objects).toHaveLength(3);

    const res = await authedFetch(`${BASE}/api/account`, { method: "DELETE" });
    expect(res.status).toBe(204);

    const left = (await env.DOCS.list()).objects.map((o) => o.key);
    expect(left).toEqual(["app-999/other-user.pdf"]);

    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM documents WHERE user_id != ?",
    )
      .bind("someone-else")
      .first<{ n: number }>();
    expect(rows!.n).toBe(0);
  }, WHOLE_ACCOUNT);
});
