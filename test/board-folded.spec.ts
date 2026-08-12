import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Which board stages are folded (#535 shell). Stored on profile rather than
// localStorage so it follows you between devices, which means it is now
// input the server has to defend: the value is read straight back into
// layout state, and an unrecognised slug there folds a column that does not
// exist while leaving a real one open.
const BASE = "http://zenith.test";

function setFolded(folded: unknown) {
  return authedFetch(`${BASE}/api/profile/board-folded`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folded }),
  });
}

function stored() {
  return env.DB.prepare("SELECT board_folded FROM profile WHERE user_id = ?")
    .bind("seed-admin")
    .first<{ board_folded: string | null }>();
}

describe("board fold state", () => {
  it("round-trips a set of stages", async () => {
    const res = await setFolded(["interested", "ghosted"]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      board_folded: ["interested", "ghosted"],
    });
    expect((await stored())?.board_folded).toBe("interested,ghosted");
  });

  it("stores in canonical stage order, whatever order it arrives in", async () => {
    // Otherwise two clients that fold the same stages disagree on the value,
    // and every save looks like a change.
    await setFolded(["ghosted", "applied", "interested"]);
    expect((await stored())?.board_folded).toBe(
      "interested,applied,ghosted",
    );
  });

  it("deduplicates", async () => {
    await setFolded(["offer", "offer", "offer"]);
    expect((await stored())?.board_folded).toBe("offer");
  });

  it("accepts the manual archive, which is a rail but not a stage", async () => {
    // Archiving is a separate flag from status, but on the board it is one
    // more rail that folds and unfolds like the rest.
    await setFolded(["archived", "interested"]);
    expect((await stored())?.board_folded).toBe("interested,archived");
  });

  it("rejects a rail that does not exist", async () => {
    const res = await setFolded(["interested", "banana"]);
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toContain("banana");
  });

  it("rejects a non-array", async () => {
    expect((await setFolded("interested")).status).toBe(400);
    expect((await setFolded(null)).status).toBe(400);
  });

  it("distinguishes 'nothing folded' from 'never set'", async () => {
    // The empty string is a decision; NULL means the client should apply its
    // own default. Collapsing the two would silently re-fold the stages
    // someone had deliberately opened.
    await setFolded([]);
    expect((await stored())?.board_folded).toBe("");
  });

  it("comes back on the profile", async () => {
    await setFolded(["screening"]);
    const p = await (
      await authedFetch(`${BASE}/api/profile`)
    ).json<{ board_folded: string | null }>();
    expect(p.board_folded).toBe("screening");
  });
});
