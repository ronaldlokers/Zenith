import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InsightsTab } from "./insights";
import type { Application, Stats } from "./types";

vi.mock("./api", () => ({
  api: {
    goals: () => Promise.resolve({ weekly_app_goal: 5, search_started_at: null }),
    interactions: () => Promise.resolve([]),
  },
}));

// insights.tsx had no tests. This covers the one line on it that turns a
// count of open applications into something that can be acted on: how many
// have been waiting longer than any reply that ever arrived.

const day = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().replace("T", " ").slice(0, 19);

const h = (id: number, to: string, at: string) => ({
  application_id: id,
  to_status: to,
  from_status: to === "applied" ? null : "applied",
  changed_at: at,
});

function statsWith(history: ReturnType<typeof h>[]): Stats {
  // stats.applications is the list, not a count — the momentum band filters
  // it. A number here throws inside computeWeeklyMomentum rather than
  // rendering anything, which is how the first version of this failed.
  const ids = [...new Set(history.map((r) => r.application_id))];
  return {
    applications: ids.map((id) => ({
      id,
      status: "applied",
      source: null,
      applied_at: day(10),
      created_at: day(10),
    })),
    history,
    interactions: [],
  } as unknown as Stats;
}

const props = {
  applications: [{ id: 1, status: "applied" }] as unknown as Application[],
  onGoToJobs: vi.fn(),
  onOpenJob: vi.fn(),
  onShowClosed: vi.fn(),
  onError: vi.fn(),
  onJump: vi.fn(),
};

function renderWith(history: ReturnType<typeof h>[]) {
  render(
    <MemoryRouter>
      <InsightsTab {...props} stats={statsWith(history)} />
    </MemoryRouter>,
  );
}

describe("the reply-time line", () => {
  it("names how many have waited longer than any reply ever took", async () => {
    // Three answers at 2, 4 and 6 days; two open for 20 and 30.
    renderWith([
      h(1, "applied", day(10)), h(1, "screening", day(8)),
      h(2, "applied", day(10)), h(2, "rejected", day(6)),
      h(3, "applied", day(10)), h(3, "screening", day(4)),
      h(4, "applied", day(20)),
      h(5, "applied", day(30)),
    ]);
    expect(
      await screen.findByText(/2 of them have waited longer than any reply/i),
    ).toBeInTheDocument();
  });

  it("stays quiet when everything open is still inside the usual range", async () => {
    // The sentence must not appear merely because something is open — that
    // would make it noise, and it is meant to be read as information.
    renderWith([
      h(1, "applied", day(30)), h(1, "screening", day(10)),
      h(2, "applied", day(30)), h(2, "rejected", day(9)),
      h(3, "applied", day(30)), h(3, "screening", day(8)),
      h(4, "applied", day(2)),
    ]);
    expect(await screen.findByText(/still waiting/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/longer than any reply/i),
      "the line appeared for a wait well inside the range replies arrive in",
    ).not.toBeInTheDocument();
  });

  it("stays quiet until there are enough replies to say it", async () => {
    renderWith([
      h(1, "applied", day(30)), h(1, "screening", day(28)),
      h(2, "applied", day(30)),
    ]);
    expect(
      screen.queryByText(/longer than any reply/i),
      "one reply is not a distribution",
    ).not.toBeInTheDocument();
  });
});
