import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { Application, Company, Contact } from "../types";
import { CommandPalette } from "./CommandPalette";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const mockApplications: Application[] = [
  {
    id: 1,
    company_id: 1,
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
    next_action: null,
    next_action_at: null,
    deadline_at: null,
    archived_at: null,
    fit_score: null,
    cover_letter: null,
    job_description: null,
    job_description_captured_at: null,
    tags: [],
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  },
];

const mockCompanies: Company[] = [];
const mockContacts: Contact[] = [];

const noop = () => {};

function renderPalette() {
  return render(
    <CommandPalette
      applications={mockApplications}
      companies={mockCompanies}
      contacts={mockContacts}
      onClose={noop}
      onJumpToApplication={noop}
      onJumpToCompany={noop}
      onJumpToContact={noop}
      actions={[{ id: "add-job", label: "Add a job", run: noop }]}
    />,
  );
}

describe("CommandPalette", () => {
  test("renders the search input", () => {
    renderPalette();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  test("typing filters and shows matching results", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Staff" },
    });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Staff Engineer/ })).toBeInTheDocument();
  });

  test("emits zui-palette classes, never the legacy palette name", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Staff" },
    });
    const input = screen.getByRole("combobox");
    expect(input).toHaveClass("zui-palette-input");
    expect(input.className).not.toMatch(/(^|\s)palette-input(\s|$)/);
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("zui-palette-results");
    expect(listbox.className).not.toMatch(/(^|\s)palette-results(\s|$)/);
    const option = screen.getByRole("option", { name: /Staff Engineer/ });
    expect(option).toHaveClass("zui-palette-item");
    expect(option.className).not.toMatch(/(^|\s)palette-item(\s|$)/);
  });
});
