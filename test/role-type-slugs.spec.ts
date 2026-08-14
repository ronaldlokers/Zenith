import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// The board's role filter uses "all" to mean "no filter", and an application
// with no role type carries "other". A role type owning either slug is a row
// that cannot be filtered to — picking it clears the filter instead.
//
// Measured before the fix: POST with the label "All" returned 201 and the
// slug "all".
const BASE = "http://zenith.test";

const create = (label: string) =>
  authedFetch(`${BASE}/api/role-types`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });

const slugOf = async (res: Response) =>
  ((await res.json()) as { slug: string }).slug;

describe("a role type named after a reserved slug", () => {
  it("keeps the label and takes a slug of its own", async () => {
    const res = await create("All");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string; label: string };
    expect(
      body.slug,
      "the role type took the board's no-filter sentinel and became unfilterable",
    ).not.toBe("all");
    expect(body.label, "the label someone typed was rewritten").toBe("All");
  });

  it("does the same for the fallback role type's slug", async () => {
    // "other" is what an application carries when no role is set, and the
    // share page skips it when working out the top role.
    const res = await create("Other things");
    expect(await slugOf(res)).not.toBe("other");
  });

  it("still slugs an ordinary label plainly", async () => {
    // The suffix must be reserved for the collision, not applied to
    // everything: an ordinary role keeps the readable slug.
    expect(await slugOf(await create("Backend Engineer"))).toBe(
      "backend-engineer",
    );
  });

  it("still refuses a second role type with the same name", async () => {
    // Unchanged on purpose. A duplicate is a mistake worth reporting, not one
    // to paper over with a suffix — only the reserved words are stepped past.
    await create("Data Platform");
    const again = await create("Data Platform");
    expect(again.status).toBe(409);
  });
});
