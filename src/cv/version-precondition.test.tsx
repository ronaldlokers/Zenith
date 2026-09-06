import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkExperienceSection } from "./sections";
import { api } from "../api";
import type { WorkExperience } from "../types";
import "../i18n";

// The server half of this (migration 0063, the 412s) is in
// test/cv-concurrent-edit.spec.ts. A precondition nothing sends is decorative,
// so this is the half that spec structurally cannot see: that the CV form
// actually puts the version it loaded on the wire.
function role(over: Partial<WorkExperience> = {}): WorkExperience {
  return {
    id: 7,
    company: "Northwind",
    title: "Engineer",
    description: null,
    start_month: 1,
    start_year: 2020,
    end_month: null,
    end_year: null,
    is_current: 1,
    sort_order: 1,
    skills: [],
    updated_at: "2026-01-01 09:00:00",
    ...over,
  } as unknown as WorkExperience;
}

describe("saving a CV role", () => {
  it("sends the version it loaded, so a stale save can be refused", async () => {
    const update = vi.spyOn(api, "update").mockResolvedValue({} as never);
    render(
      <WorkExperienceSection
        items={[role()]}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        onError={vi.fn()}
        notify={vi.fn()}
      />,
    );

    // Edit lives in the row's ⋯ menu, which is opened by the row's own button.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Engineer/i }));
    await user.click(await screen.findByRole("menuitem", { name: /edit/i }));
    await user.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [resource, id, , expectedUpdatedAt] = update.mock.calls[0];
    expect(resource).toBe("work-experience");
    expect(id).toBe(7);
    expect(
      expectedUpdatedAt,
      "the form saves with no precondition, so the server's 412 is unreachable",
    ).toBe("2026-01-01 09:00:00");
    update.mockRestore();
  });
});
