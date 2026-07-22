import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { Application } from "../types";
import { CoverLetterSection } from "./CoverLetterSection";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
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
};

const noop = () => {};
const noopAsync = () => Promise.resolve();

describe("CoverLetterSection", () => {
  test("renders the generate and save actions", () => {
    render(
      <CoverLetterSection
        application={mockApplication}
        onChanged={noopAsync}
        onError={noop}
        notify={noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Generate draft" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  test("seeds the textarea from application.cover_letter", () => {
    render(
      <CoverLetterSection
        application={{ ...mockApplication, cover_letter: "Dear hiring manager," }}
        onChanged={noopAsync}
        onError={noop}
        notify={noop}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Dear hiring manager,");
  });

  test("emits zui-cover-letter classes, never the legacy cover-letter name", () => {
    const { container } = render(
      <CoverLetterSection
        application={mockApplication}
        onChanged={noopAsync}
        onError={noop}
        notify={noop}
      />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-cover-letter");
    expect(root?.className).not.toMatch(/(^|\s)cover-letter(\s|$)/);
  });
});
