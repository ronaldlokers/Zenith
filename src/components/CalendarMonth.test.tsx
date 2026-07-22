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
    render(<CalendarMonth entries={mockEntries} onJump={noop} />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acme Corp" })).toBeInTheDocument();
  });

  test("emits zui-cal classes, never the legacy cal- name", () => {
    const { container } = render(<CalendarMonth entries={mockEntries} onJump={noop} />);
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-cal-month");
    expect(root?.className).not.toMatch(/(^|\s)cal-month(\s|$)/);
    const chip = screen.getByRole("button", { name: "Acme Corp" });
    expect(chip).toHaveClass("zui-cal-chip");
    expect(chip.className).not.toMatch(/(^|\s)cal-chip(\s|$)/);
  });
});
