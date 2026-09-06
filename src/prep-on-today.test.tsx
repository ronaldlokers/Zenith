import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import type { Application } from "./types";
import { DashboardTab } from "./dashboard";
import "./i18n";
import { daysFromToday } from "./format";

// The helper being right is not the fix. Today has to actually show the row —
// a correct openPrepCount that nothing calls leaves the screen just as blank.
vi.mock("./api", () => ({
  api: {
    goals: () => Promise.resolve(null),
    profile: () => Promise.resolve({}),
    feedSummary: () => Promise.resolve({ count: 0, sources: [] }),
  },
}));

function app(over: Partial<Application>): Application {
  return {
    id: 1,
    company_name: "Northwind",
    title: "Staff Engineer",
    status: "interview",
    next_action: null,
    next_action_at: null,
    archived_at: null,
    pinned_at: null,
    fit_score: null,
    tags: [],
    created_at: daysFromToday(-10),
    updated_at: daysFromToday(-2),
    ...over,
  } as Application;
}

const dashboard = (applications: Application[]) =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <DashboardTab
        applications={applications}
        goal={null}
        stats={{ applications: [], history: [], interactions: [] }}
        onOpenJob={() => {}}
        onChanged={() => Promise.resolve()}
        onError={() => {}}
        notify={() => {}}
        onGoToFeed={() => {}}
        onGoToJobs={() => {}}
        onOpenQuickAdd={() => {}}
      />
    </MemoryRouter>,
  );

describe("an interview with unchecked prep and nothing typed", () => {
  test("is named on Today instead of leaving it blank", async () => {
    dashboard([app({ open_prep_items: 4 })]);
    expect(
      await screen.findByText(/finish interview prep/i),
      "Today is silent about four unchecked prep items on an interview",
    ).toBeTruthy();
    expect(screen.getByText(/4 left/i)).toBeTruthy();
  });

  test("defers to what the user typed", async () => {
    // Asserted as absence, not presence: an application with a typed action
    // but no date is not in the due list at all, so the row does not render
    // either way. What matters is that the checklist does not speak over them.
    dashboard([app({ open_prep_items: 4, next_action: "Call Dana about the panel" })]);
    expect(screen.queryByText(/finish interview prep/i)).toBeNull();
  });

  test("says nothing once the checklist is done", async () => {
    dashboard([app({ open_prep_items: 0 })]);
    expect(screen.queryByText(/finish interview prep/i)).toBeNull();
  });
});
