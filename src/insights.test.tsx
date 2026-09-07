import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InsightsTab } from "./insights";
import type { Application, Stats, Status } from "./types";

const listed: Record<string, unknown[]> = { skills: [], "work-experience": [] };

vi.mock("./api", () => ({
  api: {
    goals: () => Promise.resolve({ weekly_app_goal: 5, search_started_at: null }),
    interactions: () => Promise.resolve([]),
    list: (resource: string) => Promise.resolve(listed[resource] ?? []),
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

describe("the recurring gaps block", () => {
  const withJd = (id: number, jd: string | null) =>
    ({ id, status: "applied", job_description: jd }) as unknown as Application;

  function renderWithApps(apps: Application[]) {
    render(
      <MemoryRouter>
        <InsightsTab
          {...props}
          applications={apps}
          stats={statsWith([h(1, "applied", day(10))])}
        />
      </MemoryRouter>,
    );
  }

  it("names a skill several postings ask for that no role backs", async () => {
    listed.skills = [{ id: 1, name: "Terraform" }, { id: 2, name: "Go" }];
    listed["work-experience"] = [{ id: 1, skills: [{ id: 2, name: "Go" }] }];
    renderWithApps([
      withJd(1, "terraform and go"),
      withJd(2, "terraform please"),
      withJd(3, "terraform again, plus go"),
    ]);
    expect(await screen.findByText("Terraform")).toBeInTheDocument();
    expect(screen.getByText(/in 3 of them/i)).toBeInTheDocument();
    expect(
      screen.queryByText("Go"),
      "a skill the work history already evidences was listed as a gap",
    ).not.toBeInTheDocument();
  });

  it("stays quiet below three saved descriptions", async () => {
    // One posting asking for something is a job ad, not a pattern. Naming it
    // here would send someone to rewrite a CV on the strength of one advert.
    listed.skills = [{ id: 1, name: "Terraform" }];
    listed["work-experience"] = [];
    renderWithApps([withJd(1, "terraform"), withJd(2, "terraform")]);
    await screen.findByText(/still waiting|typically come|Not enough replies/i);
    expect(screen.queryByText("Terraform")).not.toBeInTheDocument();
  });

  it("stays quiet when the CV cannot be read", async () => {
    // The fetch failing must cost this block and nothing else on the page.
    listed.skills = [];
    listed["work-experience"] = [];
    renderWithApps([
      withJd(1, "terraform"),
      withJd(2, "terraform"),
      withJd(3, "terraform"),
    ]);
    await screen.findByText(/still waiting|typically come|Not enough replies/i);
    expect(screen.queryByText(/Asked for, not on your CV/i)).not.toBeInTheDocument();
  });
});

// The section exists to compare channels. On an account that has only ever
// typed applications in, it repeats the response-rate card above it with a
// label on it — so it is drawn only when there is a comparison to make.
describe("the where-they-came-from block", () => {
  const statsWithSources = (sources: (string | null)[]): Stats =>
    ({
      applications: sources.map((source, i) => ({
        id: i + 1,
        status: "applied",
        source,
        applied_at: day(10),
        created_at: day(10),
      })),
      history: sources.flatMap((_, i) => [
        h(i + 1, "applied", day(10)),
        h(i + 1, "screening", day(6)),
      ]),
      interactions: [],
    }) as unknown as Stats;

  const renderSources = (sources: (string | null)[]) =>
    render(
      <MemoryRouter>
        <InsightsTab {...props} stats={statsWithSources(sources)} />
      </MemoryRouter>,
    );

  it("stays hidden when everything came in the same way", () => {
    renderSources([null, null, null, null]);
    expect(screen.queryByText(/Where your applications come from/i)).toBeNull();
  });

  it("appears once there are two channels to compare, and groups the feed", () => {
    renderSources(["feed:adzuna", "feed:greenhouse", "feed:ashby", null]);
    expect(screen.getByText(/Where your applications come from/i)).toBeTruthy();
    // The three feed boards are one channel, not three rows of one.
    expect(screen.getByText("Feed")).toBeTruthy();
    expect(screen.getByText("3 applications · 3 sent")).toBeTruthy();
    expect(screen.getByText("Added by hand")).toBeTruthy();
  });

  it("says so rather than printing a percentage off one application", () => {
    renderSources(["extension", null, null, null]);
    // Scoped to the extension row on purpose. The manual row here is three
    // applications that all advanced, so 100% is its honest answer and the
    // floor is met — asserting "no 100% anywhere" would have been asserting
    // the wrong thing, and did.
    const extensionRow = screen.getByText("Browser extension").closest("li")!;
    expect(within(extensionRow).getByText("too few to rate")).toBeTruthy();
    expect(within(extensionRow).queryByText(/%/)).toBeNull();
  });
});

// README and PRODUCT.md both name ghost rate as a shipped Insights metric.
// Nothing computed it: "ghosted" was a status, a one-tap action and a bucket
// of outcome labels, never a fraction.
describe("the ghost rate", () => {
  const ended = (id: number, to: Status, reason?: string) =>
    ({
      application_id: id,
      from_status: "applied",
      to_status: to,
      changed_at: day(5),
      ...(reason ? { outcome_reason: reason } : {}),
    }) as ReturnType<typeof h>;

  it("states the share of finished applications that went silent", () => {
    renderWith([
      ended(1, "ghosted" as Status),
      ended(2, "ghosted" as Status),
      ended(3, "rejected" as Status, "after_interview"),
      ended(4, "withdrawn" as Status, "comp_too_low"),
    ]);
    expect(screen.getByText(/50% of the applications that ended went silent/i)).toBeTruthy();
    expect(screen.getByText(/2 of 4/)).toBeTruthy();
  });

  it("declines to give a percentage off too few finished applications", () => {
    renderWith([ended(1, "ghosted" as Status)]);
    expect(screen.getByText(/needs 3 finished applications/i)).toBeTruthy();
    expect(screen.queryByText(/100%/)).toBeNull();
  });
});

describe("the search-week label here, not only on Today", () => {
  it("says the start date was inferred, since the goals mock sets none", () => {
    // The card named both surfaces, and they shared the fallback by
    // copy-paste. Insights now takes it from the same helper as Today, so
    // this is the assertion that would notice only this one drifting back.
    renderWith([h(1, "applied", day(10))]);
    return waitFor(() =>
      expect(screen.getByText(/since your first application/i)).toBeInTheDocument(),
    );
  });
});
