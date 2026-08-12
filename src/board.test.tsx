import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Application, Profile, Status } from "./types";
import { PipelineTab } from "./board";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "./i18n";

// The board is the only place a closed or archived application can be
// reached now that the Archive screen is gone (#535 shell), so what folds,
// what a rail holds, and what a fold writes back are all behaviour worth
// pinning: none of it is covered by the screenshot rig, which is not a CI
// gate.
let savedFolded: string[] | null = null;
let profileFolded: string | null = null;

vi.mock("./api", () => ({
  api: {
    profile: () => Promise.resolve({ board_folded: profileFolded } as Profile),
    setBoardFolded: (folded: string[]) => {
      savedFolded = folded;
      return Promise.resolve({ board_folded: folded });
    },
    savedViews: () => Promise.resolve([]),
    updateFollowUp: () => Promise.resolve(undefined),
    archiveApplication: () => Promise.resolve(undefined),
    unarchiveApplication: () => Promise.resolve(undefined),
  },
}));

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

function app(over: Partial<Application> & { id: number }): Application {
  return {
    company_id: null,
    company_name: "Northwind",
    contact_id: null,
    title: `Role ${over.id}`,
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

function renderBoard(
  applications: Application[],
  over: { onOpenQuickAdd?: (stage?: Status) => void } = {},
) {
  return render(
    <PipelineTab
      applications={applications}
      companies={[]}
      contacts={[]}
      roleTypes={[]}
      onChanged={() => Promise.resolve()}
      onError={() => {}}
      notify={() => {}}
      onDelete={() => {}}
      onStatus={() => {}}
      lastInteractions={[]}
      history={[]}
      onSaveOutcome={() => {}}
      onOpenJob={() => {}}
      onOpenQuickAdd={over.onOpenQuickAdd ?? (() => {})}
      onOpenSampleData={() => {}}
    />,
  );
}

// A folded rail is a button; an open column's header is a fold button. Both
// carry the stage name, so tell them apart by the accessible name the fold
// state produces rather than by class.
const railFor = (stage: string) =>
  screen.queryByRole("button", { name: new RegExp(`^Open ${stage},`) });
const headerFor = (stage: string) =>
  screen.queryByRole("button", { name: `Fold ${stage}` });

describe("board rails", () => {
  test("carries all eight stages plus the archive", async () => {
    profileFolded = null;
    renderBoard([]);
    await waitFor(() => expect(headerFor("Interested")).toBeTruthy());
    for (const live of ["Interested", "Applied", "Screening", "Interview", "Offer"]) {
      expect(headerFor(live)).toBeTruthy();
    }
    // Closed and archived are folded out of the way by default, not absent —
    // there is no Archive screen to send them to.
    for (const closed of ["Rejected", "Withdrawn", "Ghosted", "Archived"]) {
      expect(railFor(closed)).toBeTruthy();
      expect(headerFor(closed)).toBeNull();
    }
  });

  test("a folded rail still counts what it holds", async () => {
    profileFolded = null;
    renderBoard([
      app({ id: 1, status: "rejected" }),
      app({ id: 2, status: "rejected" }),
    ]);
    await waitFor(() => expect(railFor("Rejected")).toBeTruthy());
    expect(railFor("Rejected")!.textContent).toContain("2");
  });

  test("an archived application sits on the archive rail, not its stage", async () => {
    profileFolded = null;
    renderBoard([app({ id: 3, status: "screening", archived_at: iso(-1) })]);
    await waitFor(() => expect(railFor("Archived")).toBeTruthy());
    // Otherwise it would show up twice — once under its status, once here.
    expect(railFor("Archived")!.textContent).toContain("1");
    expect(screen.queryByText("Role 3")).toBeNull();
  });

  test("opening a rail persists the whole folded set", async () => {
    profileFolded = null;
    savedFolded = null;
    renderBoard([]);
    await waitFor(() => expect(railFor("Rejected")).toBeTruthy());
    fireEvent.click(railFor("Rejected")!);
    expect(headerFor("Rejected")).toBeTruthy();
    expect(savedFolded).toEqual(["withdrawn", "ghosted", "archived"]);
  });

  test("folding a live stage persists it", async () => {
    profileFolded = null;
    savedFolded = null;
    renderBoard([]);
    await waitFor(() => expect(headerFor("Offer")).toBeTruthy());
    fireEvent.click(headerFor("Offer")!);
    expect(railFor("Offer")).toBeTruthy();
    expect(savedFolded).toEqual([
      "offer",
      "rejected",
      "withdrawn",
      "ghosted",
      "archived",
    ]);
  });

  test("a stored empty string means nothing is folded, not 'never set'", async () => {
    profileFolded = "";
    renderBoard([]);
    // Collapsing the two would silently re-fold the stages someone had
    // deliberately opened.
    await waitFor(() => expect(headerFor("Rejected")).toBeTruthy());
    expect(headerFor("Archived")).toBeTruthy();
  });

  test("the add block opens on the stage it sits in, and closed stages get none", async () => {
    profileFolded = "";
    const opened: (Status | undefined)[] = [];
    renderBoard([], { onOpenQuickAdd: (s) => opened.push(s) });
    await waitFor(() => expect(headerFor("Screening")).toBeTruthy());
    const adds = screen.getAllByRole("button", { name: "+ Add an application" });
    // One per live stage: nothing is created straight into a closed stage or
    // the archive.
    expect(adds).toHaveLength(5);
    fireEvent.click(adds[2]);
    expect(opened).toEqual(["screening"]);
  });
});
