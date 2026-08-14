import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkExperienceSection } from "./sections";
import { api } from "../api";
import type { WorkExperience } from "../types";

// cv/sections.tsx had no tests — 154 statements, and the delete in its ⋯ menu
// went straight to the API with no confirmation and no undo, while every
// other delete in the app hides the row and offers one. These cover the
// contract that delete now shares with the rest of the app.

function role(id: number, title: string): WorkExperience {
  return {
    id,
    company: `Company ${id}`,
    title,
    description: null,
    start_month: 1,
    start_year: 2020,
    end_month: null,
    end_year: null,
    is_current: 1,
    sort_order: id,
    skills: [],
  } as unknown as WorkExperience;
}

function setup(items: WorkExperience[]) {
  const notify = vi.fn();
  const onChanged = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  render(
    <WorkExperienceSection
      items={items}
      onChanged={onChanged}
      onError={onError}
      notify={notify}
    />,
  );
  return { notify, onChanged, onError };
}

/** Opens the ⋯ menu for a row and clicks one of its items. */
async function choose(user: ReturnType<typeof userEvent.setup>, title: string, label: RegExp) {
  await user.click(screen.getByRole("button", { name: new RegExp(title, "i") }));
  await user.click(await screen.findByRole("menuitem", { name: label }));
}

describe("deleting a CV entry", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not call the API while the undo window is open", async () => {
    // The defect: one tap in a menu, directly below Edit, and the entry was
    // gone. Nothing asked, nothing to undo.
    const remove = vi.spyOn(api, "remove").mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { notify } = setup([role(1, "Platform Engineer"), role(2, "Backend Engineer")]);

    await choose(user, "Platform Engineer", /delete/i);

    expect(remove, "the entry was deleted with no way back").not.toHaveBeenCalled();
    expect(
      screen.queryByText("Platform Engineer"),
      "the row is still on screen, so nothing looks to have happened",
    ).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Platform Engineer"),
      expect.any(Function),
    );
  });

  it("commits once the window has passed", async () => {
    const remove = vi.spyOn(api, "remove").mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup([role(1, "Platform Engineer")]);

    await choose(user, "Platform Engineer", /delete/i);
    await vi.advanceTimersByTimeAsync(6000);

    await waitFor(() => expect(remove).toHaveBeenCalledWith("work-experience", 1));
  });

  it("undo cancels it outright", async () => {
    const remove = vi.spyOn(api, "remove").mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { notify } = setup([role(1, "Platform Engineer")]);

    await choose(user, "Platform Engineer", /delete/i);
    const undo = notify.mock.calls[0][1] as () => void;
    undo();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(remove, "undo left the delete running").not.toHaveBeenCalled();
    expect(await screen.findByText("Platform Engineer")).toBeInTheDocument();
  });

  it("does not fire a pending delete after the page has gone", async () => {
    // Unmounting with a delete still pending would commit against a screen
    // whose undo is no longer reachable.
    const remove = vi.spyOn(api, "remove").mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = { unmount: () => {} } as { unmount: () => void };
    void unmount;
    const notify = vi.fn();
    const onChanged = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <WorkExperienceSection
        items={[role(1, "Platform Engineer")]}
        onChanged={onChanged}
        onError={vi.fn()}
        notify={notify}
      />,
    );
    await choose(user, "Platform Engineer", /delete/i);
    view.unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("reordering while a delete is pending", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves the row the person is looking at", async () => {
    // The hidden row shifts every index after it. Reading the unfiltered list
    // here swaps a different pair than the one on screen — and the two lists
    // agree exactly until something is hidden, which is why this needs a
    // pending delete to catch it.
    vi.spyOn(api, "remove").mockResolvedValue(undefined);
    const patch = vi.spyOn(api, "patch").mockResolvedValue({} as never);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup([role(1, "First"), role(2, "Second"), role(3, "Third")]);

    await choose(user, "First", /delete/i);
    await choose(user, "Second", /move down/i);

    // On screen: Second, Third. Moving Second down swaps it with Third.
    const ids = patch.mock.calls.map((c) => c[1]).sort();
    expect(ids, "a row that is not on screen was reordered").toEqual([2, 3]);
  });

  it("disables move down on the last row that is actually visible", async () => {
    vi.spyOn(api, "remove").mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup([role(1, "First"), role(2, "Second")]);

    await choose(user, "Second", /delete/i);
    await user.click(screen.getByRole("button", { name: /First/i }));
    expect(
      await screen.findByRole("menuitem", { name: /move down/i }),
    ).toBeDisabled();
  });
});
