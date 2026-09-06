import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Today ranked purely off next_action, which the user types by hand, so an
// interview with real unchecked prep items and nothing typed showed nothing to
// do. The count travels on the applications list rather than a second endpoint:
// the dashboard already has every application, and one subquery is cheaper than
// a fetch per row on a screen read constantly.
const BASE = "http://zenith.test";

async function seed(): Promise<number> {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Prep count fixture", status: "interview" }),
  });
  return (await res.json<{ id: number }>()).id;
}

const listed = async (id: number) => {
  const res = await authedFetch(`${BASE}/api/applications`);
  const rows = await res.json<{ id: number; open_prep_items: number }[]>();
  return rows.find((r) => r.id === id);
};

const addItem = (id: number, text: string) =>
  authedFetch(`${BASE}/api/applications/${id}/prep-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

describe("the prep count on the applications list", () => {
  it("is zero when there is no checklist", async () => {
    const id = await seed();
    expect((await listed(id))?.open_prep_items).toBe(0);
  });

  it("counts the unchecked items", async () => {
    const id = await seed();
    await addItem(id, "Re-read the job description");
    await addItem(id, "Prepare two questions");
    expect((await listed(id))?.open_prep_items).toBe(2);
  });

  it("stops counting one that is ticked off", async () => {
    // The whole point is that it goes quiet when the work is done.
    const id = await seed();
    const created = await addItem(id, "Book the room");
    const item = await created.json<{ id: number }>();
    await authedFetch(`${BASE}/api/prep-items/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: 1 }),
    });
    expect((await listed(id))?.open_prep_items).toBe(0);
  });
});
