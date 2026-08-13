import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { FeedItem } from "./types";
import { FeedTab } from "./feed";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "./i18n";

// Swipe-to-triage (#144) is the only way to work the feed on a phone, and it
// had no test while the card's DOM was restructured under it (#553). The
// gesture is invisible to every other kind of check: it leaves no markup of
// its own, and the card looks right whether or not the handlers still fire.
const added: number[] = [];
const dismissed: number[] = [];

function item(over: Partial<FeedItem> & { id: number }): FeedItem {
  return {
    source: "adzuna",
    external_id: `ext-${over.id}`,
    title: `Role ${over.id}`,
    company: "Northwind",
    location: "Remote",
    url: null,
    salary_text: null,
    role_type: "platform-engineer",
    posted_at: null,
    fetched_at: new Date().toISOString(),
    status: "new",
    board_slug: null,
    match_count: 2,
    match_skills: [],
    ...over,
  };
}

vi.mock("./api", () => ({
  api: {
    feed: () =>
      Promise.resolve({
        items: [item({ id: 1 }), item({ id: 2 })],
        nextCursor: null,
      }),
    addFeedItem: (id: number) => {
      added.push(id);
      return Promise.resolve({ id: 900 + id });
    },
    dismissFeedItem: (id: number) => {
      dismissed.push(id);
      return Promise.resolve(undefined);
    },
  },
}));

// jsdom implements neither Touch nor TouchEvent. React reads `touches[0]`
// off the native event, so a plain Event carrying that property is enough —
// and keeps the test honest about what the handler actually depends on.
function touch(el: Element, type: string, clientX: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", {
    value: type === "touchend" ? [] : [{ clientX, clientY: 0 }],
  });
  el.dispatchEvent(e);
}

// One move per act() call: the handler stores the drag in state and reads it
// back on release, so events batched into a single render see a drag of 0 —
// which is how a synchronous version of this test passes while the gesture
// is broken.
function swipe(el: Element, dx: number) {
  act(() => touch(el, "touchstart", 0));
  for (let i = 1; i <= 4; i++) act(() => touch(el, "touchmove", (dx * i) / 4));
  act(() => touch(el, "touchend", dx));
}

function renderFeed() {
  return render(
    <FeedTab
      onError={() => {}}
      notify={() => {}}
      roleTypes={[]}
      onOpenSettings={() => {}}
      onGoToCv={() => {}}
      onChanged={() => Promise.resolve()}
      onOpenJob={() => {}}
    />,
  );
}

describe("feed swipe triage", () => {
  test("a swipe past the threshold adds the posting", async () => {
    added.length = 0;
    const { container } = renderFeed();
    await waitFor(() => expect(container.querySelector(".feed-row")).toBeTruthy());
    swipe(container.querySelector(".feed-row")!, 160);
    await waitFor(() => expect(added).toEqual([1]));
  });

  test("a swipe the other way dismisses it", async () => {
    dismissed.length = 0;
    const { container } = renderFeed();
    await waitFor(() => expect(container.querySelector(".feed-row")).toBeTruthy());
    swipe(container.querySelector(".feed-row")!, -160);
    await waitFor(() => expect(dismissed).toEqual([1]));
  });

  test("a short drag is not a swipe", async () => {
    // The threshold is what stops a scroll gesture filing an application.
    added.length = 0;
    dismissed.length = 0;
    const { container } = renderFeed();
    await waitFor(() => expect(container.querySelector(".feed-row")).toBeTruthy());
    swipe(container.querySelector(".feed-row")!, 40);
    await new Promise((r) => setTimeout(r, 50));
    expect(added).toEqual([]);
    expect(dismissed).toEqual([]);
    // Scoped to the list: the detail pane echoes the focused card's title.
    expect(container.querySelectorAll(".feed-row").length).toBe(2);
  });
});
