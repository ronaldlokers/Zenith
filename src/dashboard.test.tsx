import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Application, Stats, Status } from "./types";
import { DashboardTab } from "./dashboard";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "./i18n";

vi.mock("./api", () => ({
  api: {
    goals: () => Promise.resolve(null),
    updateFollowUp: () => Promise.resolve(undefined),
    archiveApplication: () => Promise.resolve(undefined),
    unarchiveApplication: () => Promise.resolve(undefined),
  },
}));

const DAY = 86400000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

function app(over: Partial<Application> & { id: number }): Application {
  return {
    company_id: null,
    company_name: "Northwind",
    contact_id: null,
    title: "Senior Platform Engineer",
    role_type: "platform-engineer",
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
    status: "applied" as Status,
    notes: null,
    applied_at: iso(-10),
    next_action: null,
    next_action_at: null,
    deadline_at: null,
    archived_at: null,
    fit_score: null,
    cover_letter: null,
    job_description: null,
    job_description_captured_at: null,
    tags: [],
    created_at: iso(-10),
    updated_at: iso(-1),
    ...over,
  };
}

const emptyStats: Stats = { applications: [], history: [], interactions: [] };

const noop = () => {};
const props = {
  onOpenJob: noop,
  onGoToJobs: noop,
  onError: noop,
  onChanged: noop,
  notify: noop,
  onOpenQuickAdd: noop,
};

describe("DashboardTab (Today)", () => {
  test("a Next Up row opens the application — the screen's core loop", () => {
    const opened: number[] = [];
    render(
      <DashboardTab
        {...props}
        applications={[app({ id: 7, next_action_at: iso(-2) })]}
        stats={emptyStats}
        onOpenJob={(id) => opened.push(id)}
      />,
    );
    const list = screen.getByRole("list", { name: "Next up" });
    // The row-open button is the row's first control; the ⋯ menu trigger
    // ("Actions for …") also carries the title in its accessible name.
    fireEvent.click(
      within(list).getAllByRole("button", {
        name: /Senior Platform Engineer/,
      })[0],
    );
    expect(opened).toEqual([7]);
  });

  test("the hero count and the Due segment count are the same number", () => {
    render(
      <DashboardTab
        {...props}
        applications={[
          app({ id: 1, next_action_at: iso(-2) }),
          app({ id: 2, next_action_at: iso(0) }),
          app({ id: 3, next_action_at: iso(30) }),
        ]}
        stats={emptyStats}
      />,
    );
    // The figure and its label are separate elements in the hero tile.
    const hero = screen.getByRole("button", { name: /things need you today/ });
    expect(hero).toHaveTextContent("2things need you today");
    expect(screen.getByRole("button", { name: "Due 2" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upcoming 1" }),
    ).toBeInTheDocument();
  });

  test("the hero switches Next Up to the upcoming half when nothing is due", () => {
    render(
      <DashboardTab
        {...props}
        applications={[app({ id: 4, next_action_at: iso(30) })]}
        stats={emptyStats}
      />,
    );
    expect(screen.getByText("Nothing due today.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /follow-up scheduled, none due today/,
      }),
    );
    const list = screen.getByRole("list", { name: "Next up" });
    expect(
      within(list).getAllByRole("button", {
        name: /Senior Platform Engineer/,
      })[0],
    ).toBeInTheDocument();
  });

  test("names the unplanned state instead of calling it caught up", () => {
    render(
      <DashboardTab
        {...props}
        applications={[app({ id: 5 }), app({ id: 6 })]}
        stats={emptyStats}
      />,
    );
    expect(
      screen.getByText("applications with nothing scheduled"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
  });

  test("an empty account is asked for its first application, not congratulated", () => {
    render(<DashboardTab {...props} applications={[]} stats={emptyStats} />);
    expect(screen.getByText("Nothing tracked yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add your first application" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/caught up/i)).not.toBeInTheDocument();
  });

  test("the ascent strip labels every stage with a count, not colour alone", () => {
    render(
      <DashboardTab
        {...props}
        applications={[
          app({ id: 1, status: "applied" }),
          app({ id: 2, status: "applied" }),
          app({ id: 3, status: "interview" }),
        ]}
        stats={emptyStats}
      />,
    );
    const strip = screen.getByRole("list", {
      name: "Live applications by stage",
    });
    const items = within(strip).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[1]).toHaveTextContent("2Applied");
    expect(items[3]).toHaveTextContent("1Interview");
    expect(items[0]).toHaveTextContent("0Interested");
  });

  test("rows stay list items, so a screen reader still counts them", () => {
    render(
      <DashboardTab
        {...props}
        applications={[
          app({ id: 1, next_action_at: iso(-1) }),
          app({ id: 2, next_action_at: iso(-2), title: "Staff SRE" }),
        ]}
        stats={emptyStats}
      />,
    );
    const list = screen.getByRole("list", { name: "Next up" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  test("this week reports stage moves, and reports an empty week honestly", () => {
    const stats: Stats = {
      applications: [
        { id: 1, status: "interview", source: null, applied_at: iso(-3), created_at: iso(-3) },
      ],
      history: [
        {
          application_id: 1,
          from_status: "screening",
          to_status: "interview",
          changed_at: iso(-2),
        },
      ],
      interactions: [],
    };
    const opened: number[] = [];
    const { rerender } = render(
      <DashboardTab
        {...props}
        applications={[app({ id: 1, status: "interview" })]}
        stats={stats}
        onOpenJob={(id) => opened.push(id)}
      />,
    );
    const moved = screen.getByRole("list", { name: "Moved this week" });
    expect(moved).toHaveTextContent("Screening");
    expect(moved).toHaveTextContent("Interview");
    fireEvent.click(
      within(moved).getAllByRole("button", {
        name: /Senior Platform Engineer/,
      })[0],
    );
    expect(opened).toContain(1);

    rerender(
      <DashboardTab
        {...props}
        applications={[app({ id: 1, status: "interview" })]}
        stats={{ ...stats, history: [] }}
      />,
    );
    expect(
      screen.getByText("Nothing changed stage this week."),
    ).toBeInTheDocument();
  });

  test("no weekly quota and no streak on Today", () => {
    render(
      <DashboardTab
        {...props}
        applications={[app({ id: 1 })]}
        stats={emptyStats}
      />,
    );
    expect(screen.queryByText(/Weekly goal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
  });

  test("the route has one h1", () => {
    render(
      <DashboardTab
        {...props}
        applications={[app({ id: 1, next_action_at: iso(-1) })]}
        stats={emptyStats}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Today",
    );
  });
});
