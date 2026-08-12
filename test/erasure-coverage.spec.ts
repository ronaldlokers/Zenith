import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { wipeUserData } from "../worker/demo";
import { authedFetch } from "./helpers";

// Deleting an account has to leave nothing behind. Two mechanisms are meant
// to guarantee that — ON DELETE CASCADE from the user row, and wipeUserData
// as belt-and-braces — and a table can fall through both: no foreign key, and
// not on the list. Three had, including cv_versions, which holds a full CV
// snapshot: name, email, phone, address, every job.
const BASE = "http://zenith.test";

async function userScopedTables(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.name FROM sqlite_master m
     WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf%'`,
  ).all<{ name: string }>();
  const out: string[] = [];
  for (const { name } of results) {
    const cols = await env.DB.prepare(
      `SELECT 1 AS hit FROM pragma_table_info('${name}') WHERE name = 'user_id'`,
    ).first<{ hit: number }>();
    if (cols) out.push(name);
  }
  return out;
}

describe("erasure coverage", () => {
  it("leaves nothing behind for a deleted account", async () => {
    // Give the user a row in as many tables as the API reaches easily, then
    // delete the account and look for survivors in every user-scoped table.
    await authedFetch(`${BASE}/api/account/sample-data`, { method: "POST" });
    await authedFetch(`${BASE}/api/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "a private note" }),
    });
    await authedFetch(`${BASE}/api/cv-versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "v1", snapshot: "{}" }),
    });

    await wipeUserData(env, "seed-admin");
    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind("seed-admin").run();

    const survivors: string[] = [];
    for (const table of await userScopedTables()) {
      const row = await env.DB.prepare(
        `SELECT 1 AS hit FROM ${table} WHERE user_id = ? LIMIT 1`,
      )
        .bind("seed-admin")
        .first<{ hit: number }>();
      if (row) survivors.push(table);
    }
    expect(survivors, "rows left behind after deleting the account").toEqual([]);
  });
});
