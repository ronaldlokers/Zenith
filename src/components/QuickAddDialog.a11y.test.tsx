import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { QuickAddDialog } from "./QuickAddDialog";
import "../i18n";

// Both submit buttons are disabled while the title is empty. That is a good
// structural guard — there is never a failed-validation state to announce, so
// no WCAG 3.3.1 failure — but it trades it for a silently inert control:
// nothing said *why* it would not activate. Someone using a screen reader met
// "button, dimmed" and no explanation.
//
// The reason now lives on the title field, described by a hint, because the
// field is where the fix is made. The buttons point at the same hint, which
// costs nothing and helps in the browse modes that can reach a disabled
// button.
vi.mock("../api", () => ({ api: { create: () => Promise.resolve({ id: 1 }) } }));

const open = () =>
  render(
    <QuickAddDialog
      companies={[]}
      onClose={() => {}}
      onCreated={() => {}}
      onError={() => {}}
    />,
  );

describe("quick add before a title is typed", () => {
  test("says why the buttons will not activate", () => {
    open();
    const title = screen.getByLabelText(/title/i);
    const describedBy = title.getAttribute("aria-describedby");
    expect(describedBy, "the title field explains nothing").toBeTruthy();

    const hint = document.getElementById(describedBy!.split(" ")[0]);
    expect(hint?.textContent ?? "", "the hint is empty").toMatch(/title/i);
  });

  test("puts the same explanation on the inert buttons", () => {
    open();
    for (const name of [/add & open/i, /^add$/i]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(
        button.getAttribute("aria-describedby"),
        `${name} is dimmed with no reason attached`,
      ).toBeTruthy();
    }
  });

  test("stops explaining once there is nothing to explain", () => {
    // A permanent hint is chrome that teaches people to stop reading it, and
    // the buttons are no longer inert so there is nothing to describe.
    open();
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Staff Engineer" },
    });
    expect(screen.getByRole("button", { name: /add & open/i })).not.toBeDisabled();
    expect(
      screen.getByLabelText(/title/i).getAttribute("aria-describedby"),
      "the hint is still attached once the field is filled",
    ).toBeFalsy();
  });
});
