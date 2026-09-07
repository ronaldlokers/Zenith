import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Application } from "../types";
import { DetailPrepTab } from "./prep-tab";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

// InterviewPrepSection fetches on mount; nothing in this tab cares about the
// shape of the response, only that mounting doesn't throw.
vi.mock("../api", () => ({
  api: {
    list: () => Promise.resolve([]),
  },
}));

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
  cover_letter: null,
  job_description: null,
  job_description_captured_at: null,
  tags: [],
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const noop = () => {};

describe("DetailPrepTab", () => {
  test("renders the interview prep, AI practice, mock interview and negotiation sections", () => {
    render(<DetailPrepTab application={mockApplication} onError={noop} />);
    // Headings unique to this tab — proves it's Prep and not Track or
    // Tailor, not just that something mounted.
    expect(
      screen.getByRole("heading", { name: "Interview prep" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "AI practice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Mock interview (AI)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Salary negotiation (AI)" }),
    ).toBeInTheDocument();
    // Track/Tailor headings must not leak in.
    expect(
      screen.queryByRole("heading", { name: "Timeline" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "ATS check" }),
    ).not.toBeInTheDocument();
  });

  test("shows the missing-JD grounding hint when the application has none", () => {
    render(<DetailPrepTab application={mockApplication} onError={noop} />);
    expect(
      screen.getByText(
        "Add a job description to ground the AI sessions below in this specific role.",
      ),
    ).toBeInTheDocument();
  });
});
