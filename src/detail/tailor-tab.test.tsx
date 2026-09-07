import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { Application } from "../types";
import { DetailTailorTab } from "./tailor-tab";
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
  pinned_at: null,
  fit_score: null,
  cover_letter: "Dear hiring manager,",
  job_description: null,
  job_description_captured_at: null,
  tags: [],
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const noop = () => {};
const noopAsync = () => Promise.resolve();

describe("DetailTailorTab", () => {
  test("renders the keyword-match and cover-letter sections", () => {
    render(
      <DetailTailorTab
        application={mockApplication}
        onChanged={noopAsync}
        onError={noop}
        notify={noop}
      />,
    );
    // Headings unique to this tab — proves it's Tailor and not Track or Prep.
    expect(
      screen.getByRole("heading", { name: "ATS check" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cover letter" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Interview prep" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Timeline" }),
    ).not.toBeInTheDocument();
  });

  test("seeds the cover letter editor from the application", () => {
    render(
      <DetailTailorTab
        application={mockApplication}
        onChanged={noopAsync}
        onError={noop}
        notify={noop}
      />,
    );
    expect(
      screen.getByDisplayValue("Dear hiring manager,"),
    ).toBeInTheDocument();
  });
});
