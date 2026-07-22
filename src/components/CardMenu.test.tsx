import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { Application } from "../types";
import { CardMenu } from "./CardMenu";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys — CardMenu is the first owned component to use useTranslation.
import "../i18n";

const mockApplication: Application = {
  id: 1,
  company_id: null,
  company_name: "Acme Corp",
  contact_id: null,
  contact_name: null,
  title: "Staff Engineer",
  role_type: "engineering",
  url: null,
  source: null,
  salary_range: null,
  salary_currency: null,
  salary_min: null,
  salary_max: null,
  salary_period: null,
  signing_bonus: null,
  bonus_target_pct: null,
  equity_value: null,
  benefits_notes: null,
  referred_by_contact_id: null,
  posting_status: null,
  posting_checked_at: null,
  status: "interview",
  notes: null,
  applied_at: null,
  next_action: "Prep system design round",
  next_action_at: "2026-08-01",
  deadline_at: null,
  archived_at: null,
  fit_score: null,
  cover_letter: null,
  job_description: null,
  job_description_captured_at: null,
  tags: [],
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const noop = () => {};

describe("CardMenu", () => {
  test("renders the ⋯ trigger button", () => {
    render(
      <CardMenu
        a={mockApplication}
        onMove={noop}
        onSetFollowUp={noop}
        onOpenDetail={noop}
        onArchive={noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Actions for Staff Engineer" }),
    ).toBeInTheDocument();
  });

  test("clicking the trigger opens the root menu", () => {
    render(
      <CardMenu
        a={mockApplication}
        onMove={noop}
        onSetFollowUp={noop}
        onOpenDetail={noop}
        onArchive={noop}
      />,
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Staff Engineer" }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  test("the open menu has the expected action buttons", () => {
    render(
      <CardMenu
        a={mockApplication}
        onMove={noop}
        onSetFollowUp={noop}
        onOpenDetail={noop}
        onArchive={noop}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Staff Engineer" }),
    );
    expect(
      screen.getByRole("menuitem", { name: /Move to stage/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Set follow-up" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Archive" }),
    ).toBeInTheDocument();
  });

  test("emits zui-cardmenu classes, never the legacy card-menu name", () => {
    const { container } = render(
      <CardMenu
        a={mockApplication}
        onMove={noop}
        onSetFollowUp={noop}
        onOpenDetail={noop}
        onArchive={noop}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Staff Engineer" }),
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-cardmenu");
    expect(root?.className).not.toMatch(/(^|\s)card-menu(\s|$)/);
    const pop = screen.getByRole("menu");
    expect(pop).toHaveClass("zui-cardmenu-pop");
    expect(pop.className).not.toMatch(/(^|\s)card-menu-pop(\s|$)/);
  });
});
