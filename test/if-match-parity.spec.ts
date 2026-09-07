import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// The 412 path is covered per resource (concurrent-edit.spec.ts,
// cv-concurrent-edit.spec.ts, stale-form-save.spec.ts), but nothing checks
// that companies, contacts and applications answer a stale If-Match *the
// same way*. That's the actual claim behind sharing worker/if-match.ts: not
// that the check exists three times, but that it can't quietly drift in
// status code or body shape between them. A test that only exercised one
// resource would not notice the other two diverging.
const BASE = "http://zenith.test";
const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;

type Resource = {
  name: string;
  create: () => Promise<Record<string, unknown>>;
  table: string;
  put: (id: unknown, body: unknown, ifMatch: string) => Promise<Response>;
};

const resources: Resource[] = [
  {
    name: "applications",
    table: "applications",
    create: async () =>
      json(
        await authedFetch(`${BASE}/api/applications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Drift check", status: "applied" }),
        }),
      ),
    put: (id, body, ifMatch) =>
      authedFetch(`${BASE}/api/applications/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": ifMatch },
        body: JSON.stringify(body),
      }),
  },
  {
    name: "companies",
    table: "companies",
    create: async () =>
      json(
        await authedFetch(`${BASE}/api/companies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Drift Co" }),
        }),
      ),
    put: (id, body, ifMatch) =>
      authedFetch(`${BASE}/api/companies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": ifMatch },
        body: JSON.stringify(body),
      }),
  },
  {
    name: "contacts",
    table: "contacts",
    create: async () =>
      json(
        await authedFetch(`${BASE}/api/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Drift Contact" }),
        }),
      ),
    put: (id, body, ifMatch) =>
      authedFetch(`${BASE}/api/contacts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": ifMatch },
        body: JSON.stringify(body),
      }),
  },
];

describe("If-Match parity across companies, contacts and applications", () => {
  for (const r of resources) {
    it(`${r.name}: a stale If-Match gets a 412 carrying the real current version`, async () => {
      const made = await r.create();
      const id = made.id;
      const staleVersion = made.updated_at as string;
      expect(staleVersion, "new rows carry a version").toBeTruthy();

      // Force the row's real updated_at away from what the client holds, the
      // same way concurrent-edit.spec.ts does: relying on the clock to
      // advance doesn't work, since updated_at is second-resolution and a
      // seed plus a write can land in the same second.
      const actualCurrent = "2030-01-01 09:00:00";
      await env.DB.prepare(`UPDATE ${r.table} SET updated_at = ? WHERE id = ?`)
        .bind(actualCurrent, id)
        .run();

      const res = await r.put(id, made, staleVersion);
      expect(res.status, `${r.name} PUT with a stale If-Match must 412`).toBe(412);

      const body = await json(res);
      expect(body.current_updated_at, `${r.name} 412 body must carry current_updated_at`).toBe(
        actualCurrent,
      );
    });
  }
});
