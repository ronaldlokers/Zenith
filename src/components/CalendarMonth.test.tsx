import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { today } from "../format";
import type { AgendaEntry } from "../types";
import { CalendarMonth } from "./CalendarMonth";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

// Anchored on today() so the entry always falls in the default (current
// month) view, regardless of when the test runs.
const mockEntries: AgendaEntry[] = [
  {
    kind: "due",
    id: 2,
    date: `${today()}T00:00:00.000Z`,
    title: "Follow-up Role",
    company_name: "Beta Ltd",
    contact_name: null,
    label: "Chase the recruiter",
  },
  {
    kind: "applied",
    id: 1,
    date: `${today()}T00:00:00.000Z`,
    title: "Staff Engineer",
    company_name: "Acme Corp",
    contact_name: null,
  },
];

const noop = () => {};

describe("CalendarMonth", () => {
  test("renders the month header with nav and today buttons", () => {
    render(<CalendarMonth entries={mockEntries} onJump={noop} />);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
  });

  test("renders day cells with an event chip for today's entry", () => {
    const { container } = render(
      <CalendarMonth entries={mockEntries} onJump={noop} />,
    );
    expect(container.querySelector(".zui-cal-grid")).toBeInTheDocument();
    // The name carries the kind now — the tint was the only thing saying
    // whether this was a follow-up, a deadline or an interview, which is
    // colour alone. The visible label stays inside it, so the name still
    // contains what a speech-input user would say.
    expect(container.querySelector(".zui-cal-chip")).toBeInTheDocument();
  });

  test("says the event kind rather than only tinting it", () => {
    // The chip's background carried follow-up / deadline / interview /
    // applied and nothing else did — colour alone, which roughly 8% of men
    // cannot read.
    render(<CalendarMonth entries={mockEntries} onJump={noop} />);
    // Scoped by class: the same entry also renders in the Upcoming rail, so
    // a name query matches two buttons and throws.
    const chip = document.querySelector(".zui-cal-chip.kind-applied")!;
    // "Applied to Staff Engineer at Acme Corp" already opens with the kind,
    // so it is not prefixed again — a deadline or a follow-up is.
    expect(chip.getAttribute("aria-label")).toMatch(/^Applied to/);
    const due = document.querySelector(".zui-cal-chip.kind-due")!;
    expect(
      due.getAttribute("aria-label"),
      "a kind the sentence does not state must be prefixed",
    ).toMatch(/^Follow-up: /);
  });

  test("truncates the label on an element that can truncate", () => {
    // text-overflow does not apply to a flex item, and the chip is a flex
    // container — so with the rule on the chip the label was sliced
    // mid-word instead of ellipsised. It lives on an inner span now.
    const { container } = render(
      <CalendarMonth entries={mockEntries} onJump={noop} />,
    );
    const label = container.querySelector(
      ".zui-cal-chip.kind-applied .zui-cal-chip-label",
    );
    expect(label, "the chip label needs its own element to truncate on").toBeTruthy();
    expect(label!.textContent).toBe("Acme Corp");
  });

  test("does not claim a grid role it cannot honour", () => {
    // It used to declare role="grid" with no rows, no gridcells, no column
    // headers, no label and no arrow-key navigation — so a screen reader
    // entered table mode and found an empty table, which is worse than the
    // generic-container reading it overrode. If the real structure is ever
    // built, this test is the thing to change.
    render(<CalendarMonth entries={mockEntries} onJump={noop} />);
    expect(screen.queryByRole("grid")).toBeNull();
  });

  test("emits zui-cal classes, never the legacy cal- name", () => {
    const { container } = render(<CalendarMonth entries={mockEntries} onJump={noop} />);
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-cal-month");
    expect(root?.className).not.toMatch(/(^|\s)cal-month(\s|$)/);
    const chip = container.querySelector(".zui-cal-chip")!;
    expect(chip).toHaveClass("zui-cal-chip");
    expect(chip.className).not.toMatch(/(^|\s)cal-chip(\s|$)/);
  });
});
