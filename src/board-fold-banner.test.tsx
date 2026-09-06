import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import type { Application, Profile, Status } from "./types";
import { PipelineTab } from "./board";
import "./i18n";
import { daysFromToday } from "./format";

// Two banners, two different undo links, stacked on the primary screen. The
// board.closedOpen block and the board.allLiveFolded block render
// independently and both conditions can hold at once: fold every live stage
// while a closed rail is still expanded and the board shows two rows of
// explanation, which reads as broken chrome rather than as an explanation.
//
// Five personas raised it, which is the strongest consensus on the review
// board, and it is on the screen the product opens to.
//
// allLiveFolded wins when both apply. It describes the bigger problem — the
// whole live pipeline is hidden and only closed work is showing — and its undo
// is the one that fixes what the reader is actually looking at. Pressing it
// leaves the closed rails open, at which point closedOpen appears on its own
// and offers the smaller undo. One banner at a time, in the order the reader
// needs them.
let profileFolded: string | null = null;

vi.mock("./api", () => ({
  api: {
    profile: () => Promise.resolve({ board_folded: profileFolded } as Profile),
    setBoardFolded: () => Promise.resolve({ board_folded: [] }),
    savedViews: () => Promise.resolve([]),
    updateFollowUp: () => Promise.resolve(undefined),
    archiveApplication: () => Promise.resolve(undefined),
    unarchiveApplication: () => Promise.resolve(undefined),
  },
}));

function app(id: number, status: Status): Application {
  return {
    id,
    company_id: null,
    company_name: "Northwind",
    contact_id: null,
    title: `Role ${id}`,
    role_type: "other",
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
    status,
    notes: null,
    applied_at: daysFromToday(-5),
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
    created_at: daysFromToday(-5),
    updated_at: daysFromToday(-1),
  } as Application;
}

async function board(folded: string[]) {
  profileFolded = folded.join(",");
  render(
    <MemoryRouter initialEntries={["/board"]}>
      <PipelineTab
        applications={[app(1, "applied"), app(2, "rejected")]}
        companies={[]}
        roleTypes={[]}
        onChanged={() => Promise.resolve()}
        onError={() => {}}
        notify={() => {}}
        onStatus={() => {}}
        lastInteractions={[]}
        history={[]}
        onOpenJob={() => {}}
        focusCardId={null}
        onOpenQuickAdd={() => {}}
        onOpenSampleData={() => {}}
      />
    </MemoryRouter>,
  );
  // The fold state arrives from the profile fetch, so wait for it to land.
  await waitFor(() =>
    expect(document.querySelectorAll(".board-allfolded").length).toBeGreaterThan(0),
  );
}

const LIVE = ["interested", "applied", "screening", "interview", "offer"];

describe("the board's fold banners", () => {
  test("shows one banner, not two, when both conditions hold", async () => {
    // Every live stage folded, and the closed rails left open.
    await board(LIVE);
    expect(
      document.querySelectorAll(".board-allfolded"),
      "the board stacks two overlapping banners with two different undo links",
    ).toHaveLength(1);
  });

  test("shows the one about the bigger problem", async () => {
    await board(LIVE);
    expect(screen.getByText(/every live stage is folded/i)).toBeTruthy();
    expect(screen.queryByText(/^Closed applications are showing\.$/)).toBeNull();
  });

  test("still explains an open closed rail on its own", async () => {
    // The other banner is not deleted — it is the right one whenever the live
    // pipeline is visible and a closed rail happens to be open too.
    await board(["interested"]);
    expect(screen.getByText(/closed applications are showing/i)).toBeTruthy();
    expect(document.querySelectorAll(".board-allfolded")).toHaveLength(1);
  });
});
