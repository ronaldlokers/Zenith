import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Application, Stats, Status } from "./types";
import { DashboardTab } from "./dashboard";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "./i18n";
import { daysFromToday } from "./format";

const followUpCalls: { id: number; at: string | null }[] = [];

vi.mock("./api", () => ({
  api: {
    goals: () => Promise.resolve(null),
    updateFollowUp: (id: number, body: { next_action_at: string | null }) => {
      followUpCalls.push({ id, at: body.next_action_at });
      return Promise.resolve(undefined);
    },
    archiveApplication: () => Promise.resolve(undefined),
    unarchiveApplication: () => Promise.resolve(undefined),
  },
}));

// Dates come from the app's own daysFromToday(), not from
// toISOString().slice(0, 10). The two disagree for anyone east of UTC
// between local midnight and UTC midnight: toISOString() yields the UTC
// date, so a fixture meant to be "today" arrives as yesterday and the app —
// which computes today() from local parts — reads it as overdue. CI runs in
// UTC where the two agree, so this was green there and red on a developer's
// machine at night, which is the worst shape a flake can take.
// daysFromToday also uses setDate rather than adding 86400000, so it stays
// correct across a DST transition where a local day is 23 or 25 hours.
const iso = (offsetDays: number) => daysFromToday(offsetDays);

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
    pinned_at: null,
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
    // The figure and its label are separate elements in the hero tile, and
    // the tile is deliberately NOT a button in this state. It used to be one
    // whose click set the Next Up tab to "due" while "due" was already the
    // tab — the largest, warmest target on the screen, and pressing it
    // changed nothing. A control that looks pressable and is not teaches
    // people to distrust the ones that are (design critique, 2026-08-13).
    // One of the two is late and one is genuinely due today, so the hero says
    // so rather than calling both "today". The old copy — "2 things need you
    // today" — was a lie in every set that mixed a late follow-up in, which
    // is most of them; the count was right and the sentence was not.
    const hero = screen.getByText(/late/).closest("div");
    expect(hero).toHaveTextContent("1 late · 1 due today");
    // Asked of the hero itself, not by accessible name: the task rows below
    // it are buttons and their labels carry the same words now, so a name
    // match finds a row and reports the hero as pressable.
    expect(
      hero?.closest("button"),
      "the due-state hero must not be a button: its click had no effect",
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Due 2" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upcoming 1" }),
    ).toBeInTheDocument();
  });

  test("Next Up opens on the upcoming half when nothing is due", () => {
    render(
      <DashboardTab
        {...props}
        applications={[app({ id: 4, next_action_at: iso(30) })]}
        stats={emptyStats}
      />,
    );
    // No click. The tab used to be pinned to "due" and the hero was the only
    // thing that moved it, which made the hero work exactly once and do
    // nothing every press after — the same defect the due-state hero had.
    // The default follows the data now, so the panel opens on the half that
    // has something in it and the hero needs no click at all.
    expect(
      screen.queryByRole("button", { name: /none due today/ }),
      "the clear-state hero must not be a button either",
    ).toBeNull();
    const list = screen.getByRole("list", { name: "Next up" });
    expect(
      within(list).getAllByRole("button", {
        name: /Senior Platform Engineer/,
      })[0],
    ).toBeInTheDocument();
  });


  test("the batch push leaves offers and interviews alone and spreads the rest", async () => {
    // Both halves were live defects. It took everything overdue, so one tap
    // on what was then a 10px caption snoozed a five-star offer along with
    // the dead follow-ups; and it wrote one date to all of them, which
    // clears the screen and rebuilds the same pile as a single cliff a week
    // out — worse than the pile it replaced.
    followUpCalls.length = 0;
    render(
      <DashboardTab
        {...props}
        applications={[
          app({ id: 1, next_action_at: iso(-9), status: "applied" }),
          app({ id: 2, next_action_at: iso(-6), status: "screening" }),
          app({ id: 3, next_action_at: iso(-4), status: "offer" }),
          app({ id: 4, next_action_at: iso(-3), status: "interview" }),
          app({ id: 5, next_action_at: iso(-2), status: "applied" }),
        ]}
        stats={emptyStats}
      />,
    );

    const push = screen.getByRole("button", { name: /Push 3 late follow-ups/ });
    expect(
      push,
      "the count must exclude the offer and the interview, not just the write",
    ).toBeInTheDocument();
    fireEvent.click(push);
    await waitFor(() => expect(followUpCalls.length).toBe(3));

    expect(followUpCalls.map((c) => c.id).sort()).toEqual([1, 2, 5]);

    // The dates themselves, not just that there is more than one of them.
    // Found by mutation: "spread from tomorrow" passed a size check while
    // rebuilding the pile a day later, which is the thing the spread exists
    // to prevent. Two a day, starting three days out, most urgent first —
    // the rule the code comment states, asserted rather than implied.
    expect(
      followUpCalls.map((c) => c.at),
      "the batch no longer lands two a day from three days out",
    ).toEqual([iso(3), iso(3), iso(4)]);
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
    // One card, two time groups. It used to be two cards — "Moved this
    // week" over 7 days and "Happened today" over 24 hours, both reading the
    // same status_history rows — so today was a subset of the week by
    // construction and the pair listed the same events twice whenever the
    // user actually did something. This move was two days ago, so it belongs
    // under Earlier this week.
    const moved = screen.getByRole("list", { name: "Earlier this week" });
    expect(moved).toHaveTextContent("Screening");
    expect(moved).toHaveTextContent("Interview");
    expect(
      screen.queryByRole("list", { name: "Today" }),
      "nothing moved today, so that group should not render",
    ).toBeNull();
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

  test("renders no h1 — the shell owns the page title", () => {
    // The route still has exactly one h1; it just is not this component's
    // any more. The shell renders it once for every screen (#535), so a
    // second one here would put two level-1 headings in the outline and
    // print the word "Today" twice.
    render(
      <DashboardTab
        {...props}
        applications={[app({ id: 1, next_action_at: iso(-1) })]}
        stats={emptyStats}
      />,
    );
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    // Its own headings start one level down, so the outline stays ordered
    // under the shell's title rather than skipping a level.
    expect(
      screen.getAllByRole("heading", { level: 2 }).length,
    ).toBeGreaterThan(0);
  });
});
