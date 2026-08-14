import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import type { Application, Profile, Status } from "./types";
import { PipelineTab } from "./board";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "./i18n";

// Back from an application used to leave focus on <body>, so the next Tab
// started at the top of the board — working through a list of jobs one at a
// time meant tabbing past every filter again for each one.
//
// Its own file rather than a describe inside board.test.tsx: that file does
// not auto-clean, so a removed input stays as document.activeElement (jsdom
// does not reset it on removal), and focus() called while the active element
// is detached does not move focus at all. Every assertion here was a false
// negative until the file was split.
vi.mock("./api", () => ({
  api: {
    profile: () => Promise.resolve({ board_folded: "" } as Profile),
    setBoardFolded: () => Promise.resolve({ board_folded: [] }),
    savedViews: () => Promise.resolve([]),
    updateFollowUp: () => Promise.resolve(undefined),
    archiveApplication: () => Promise.resolve(undefined),
    unarchiveApplication: () => Promise.resolve(undefined),
  },
}));

const iso = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString();

function app(over: Partial<Application> & { id: number }): Application {
  return {
    company_id: null,
    contact_id: null,
    title: `Role ${over.id}`,
    role_type: "platform-engineer",
    status: "applied" as Status,
    source: null,
    url: null,
    notes: null,
    next_action: null,
    next_action_at: null,
    applied_at: iso(-5),
    archived_at: null,
    pinned_at: null,
    fit_score: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    tags: [],
    created_at: iso(-10),
    updated_at: iso(-1),
    ...over,
  } as Application;
}

const board = (applications: Application[], focusCardId: number | null) => (
  <MemoryRouter initialEntries={["/board"]}>
    <PipelineTab
      applications={applications}
      companies={[]}
      roleTypes={[]}
      onChanged={() => Promise.resolve()}
      onError={() => {}}
      notify={() => {}}
      onStatus={() => {}}
      lastInteractions={[]}
      history={[]}
      onOpenJob={() => {}}
      focusCardId={focusCardId}
      onFocusRestored={() => {}}
      onOpenQuickAdd={() => {}}
      onOpenSampleData={() => {}}
    />
  </MemoryRouter>
);

const cardEl = (id: number) =>
  document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);

describe("returning from an application", () => {
  test("puts the keyboard back on the card it came from", async () => {
    // The id arrives after the board is mounted, which is the real sequence:
    // the board unmounts entirely while an application is routed, so App only
    // knows there is somewhere to return to once the route has changed back.
    const apps = [app({ id: 7 }), app({ id: 8 })];
    const view = render(board(apps, null));
    await waitFor(() => expect(cardEl(8)).toBeTruthy());

    view.rerender(board(apps, 8));
    expect(document.activeElement).toBe(cardEl(8));
  });

  test("does not take focus when there is nothing to return to", async () => {
    // A plain visit to the board is not a return, and must not pull the
    // keyboard off whatever already has it.
    const apps = [app({ id: 7 })];
    render(board(apps, null));
    await waitFor(() => expect(cardEl(7)).toBeTruthy());
    expect(document.activeElement).not.toBe(cardEl(7));
  });

  test("gives up quietly when the card is no longer on the board", async () => {
    // It can have been archived from the detail itself, or filtered out of
    // the view underneath. Nothing is focused and nothing throws.
    const apps = [app({ id: 7 })];
    const view = render(board(apps, null));
    await waitFor(() => expect(cardEl(7)).toBeTruthy());

    view.rerender(board(apps, 999));
    expect(document.activeElement).not.toBe(cardEl(7));
  });
});
