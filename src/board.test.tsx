import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Application, Profile, Status } from "./types";
import { PipelineTab } from "./board";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "./i18n";
import { daysFromToday } from "./format";

// The board is the only place a closed or archived application can be
// reached now that the Archive screen is gone (#535 shell), so what folds,
// what a rail holds, and what a fold writes back are all behaviour worth
// pinning: none of it is covered by the screenshot rig, which is not a CI
// gate.
let savedFolded: string[] | null = null;
let profileFolded: string | null = null;
let saveFails = false;

vi.mock("./api", () => ({
  api: {
    profile: () => Promise.resolve({ board_folded: profileFolded } as Profile),
    setBoardFolded: (folded: string[]) => {
      if (saveFails) return Promise.reject(new Error("nope"));
      savedFolded = folded;
      return Promise.resolve({ board_folded: folded });
    },
    savedViews: () => Promise.resolve([]),
    updateFollowUp: () => Promise.resolve(undefined),
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
const iso = (offsetDays: number) =>
  daysFromToday(offsetDays);

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

function renderBoard(
  applications: Application[],
  over: {
    onOpenQuickAdd?: (stage?: Status) => void;
    onError?: (message: string | null) => void;
    notify?: (m: string, undo?: () => void, label?: string) => void;
    // Router state, so the "Closed applications" entry point can be exercised.
    state?: unknown;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/board", state: over.state }]}>
    <PipelineTab
      applications={applications}
      companies={[]}
      contacts={[]}
      roleTypes={[]}
      onChanged={() => Promise.resolve()}
      onError={over.onError ?? (() => {})}
      notify={over.notify ?? (() => {})}
      onDelete={() => {}}
      onStatus={() => {}}
      lastInteractions={[]}
      history={[]}
      onSaveOutcome={() => {}}
      onOpenJob={() => {}}
      onOpenQuickAdd={over.onOpenQuickAdd ?? (() => {})}
      onOpenSampleData={() => {}}
    />
    </MemoryRouter>,
  );
}

// A folded rail is a button; an open column's header is a fold button. Both
// carry the stage name, so tell them apart by the accessible name the fold
// state produces rather than by class.
const railFor = (stage: string) =>
  screen.queryByRole("button", { name: new RegExp(`^Open ${stage},`) });
const headerFor = (stage: string) =>
  screen.queryByRole("button", { name: `Fold ${stage}` });
// The column's own heading, which is what says "this rail is rendered as a
// column" independently of whether it can be folded. Below 900px the fold
// button is deliberately absent — nothing folds there and an invisible
// focusable control is worse than none — so headerFor cannot stand in for
// "the column exists" at that width. The heading is sr-only there, and
// getByRole finds it: sr-only is clipped, not hidden.
const headingFor = (stage: string) =>
  screen.queryByRole("heading", { name: new RegExp(`^${stage}\\b`, "i") });
// The four closed outcomes collapse into one rail while they are all folded,
// which is the default. It is the only rail that stands for more than one
// stage, so it has its own accessible name.
const closedGroup = () =>
  screen.queryByRole("button", { name: /^Open closed applications,/ });

describe("board rails", () => {
  // The fold cache is a paint cache; a test that does not care about it must
  // start without one, or it inherits the previous test's board.
  beforeEach(() => {
    localStorage.removeItem("zenith_board_folded");
    saveFails = false;
  });

  test("carries all eight stages plus the archive", async () => {
    profileFolded = null;
    renderBoard([]);
    await waitFor(() => expect(headerFor("Interested")).toBeTruthy());
    for (const live of ["Interested", "Applied", "Screening", "Interview", "Offer"]) {
      expect(headerFor(live)).toBeTruthy();
    }
    // Closed and archived are folded out of the way by default, not absent —
    // there is no Archive screen to send them to. Folded, all four are one
    // rail: they are outcomes rather than places work happens, and four
    // slabs spelling their names one letter per line held 17% of the board
    // for the part of it that only ever grows.
    expect(closedGroup()).toBeTruthy();
    for (const closed of ["Rejected", "Withdrawn", "Ghosted", "Archived"]) {
      expect(railFor(closed)).toBeNull();
      expect(headerFor(closed)).toBeNull();
    }
  });

  test("a folded rail still counts what it holds", async () => {
    profileFolded = null;
    renderBoard([
      app({ id: 1, status: "rejected" }),
      app({ id: 2, status: "rejected" }),
    ]);
    // The count on the group is every closed application, not one stage's.
    await waitFor(() => expect(closedGroup()).toBeTruthy());
    expect(closedGroup()!.textContent).toContain("2");
  });

  test("an archived application sits on the archive rail, not its stage", async () => {
    profileFolded = null;
    renderBoard([app({ id: 3, status: "screening", archived_at: iso(-1) })]);
    await waitFor(() => expect(closedGroup()).toBeTruthy());
    // Otherwise it would show up twice — once under its status, once here.
    expect(closedGroup()!.textContent).toContain("1");
    expect(screen.queryByText("Role 3")).toBeNull();
  });

  test("opening the closed group unfolds all four in one save", async () => {
    // One save, not four: four toggles would be four requests and four
    // chances to end up half-open.
    localStorage.removeItem("zenith_board_folded");
    profileFolded = null;
    savedFolded = null;
    renderBoard([]);
    await waitFor(() => expect(closedGroup()).toBeTruthy());
    fireEvent.click(closedGroup()!);
    for (const closed of ["Rejected", "Withdrawn", "Ghosted", "Archived"]) {
      expect(headerFor(closed)).toBeTruthy();
    }
    expect(savedFolded).toEqual([]);
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

  test("nothing is folded below 900px — the strip is the navigation there", async () => {
    // A rail folded on the laptop must not hide a stage on the phone: the
    // fold state is shared between devices, but the narrow board has no way
    // to unfold anything.
    const narrow = ((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const real = window.matchMedia;
    window.matchMedia = narrow;
    try {
      profileFolded = "rejected,withdrawn,ghosted,archived";
      renderBoard([]);
      // Every rail is an open column here — the heading is still in the DOM
      // (sr-only at this width, since the strip carries the name visibly),
      // but no rail is folded away. The strip is a group of buttons rather
      // than a tablist: every column is rendered, so nothing here selects a
      // panel.
      const strip = await screen.findByRole("group", { name: "Stages" });
      expect(strip.querySelectorAll("button")).toHaveLength(9);
      expect(
        strip.querySelectorAll("[aria-current=true]"),
      ).toHaveLength(1);
      expect(railFor("Rejected")).toBeNull();
      expect(headingFor("Rejected")).toBeTruthy();
      // and no fold control, because there is nothing to fold here.
      expect(headerFor("Rejected")).toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });

  test("'Closed applications' folds the live stages and opens the closed ones", async () => {
    // There is no Archive screen: this entry point rearranges the board
    // instead, and the toast has to offer the way back — someone who lands
    // here has no way of knowing what was folded before.
    profileFolded = null;
    savedFolded = null;
    const toasts: { message: string; label?: string; undo?: () => void }[] = [];
    renderBoard([], {
      state: { showClosed: true },
      notify: (message, undo, label) => toasts.push({ message, undo, label }),
    });
    await waitFor(() => expect(headerFor("Rejected")).toBeTruthy());
    expect(headerFor("Archived")).toBeTruthy();
    expect(railFor("Interested")).toBeTruthy();
    expect(savedFolded).toEqual([
      "interested",
      "applied",
      "screening",
      "interview",
      "offer",
    ]);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].label).toBe("Back to live");
    toasts[0].undo!();
    await waitFor(() => expect(headerFor("Interested")).toBeTruthy());
  });

  test("the pinned filter opens every rail, so a pinned card cannot hide", async () => {
    // The bottom bar counts pins wherever they are, and rejected, withdrawn,
    // ghosted and archived rails are folded by default. Respecting the fold
    // here meant the bar said "Pinned 1" and the board showed nothing — a
    // blank screen that reads as broken. Measured in a browser first: pin a
    // card, move it to Rejected, press p, and the board was empty.
    profileFolded = "rejected,withdrawn,ghosted,archived";
    savedFolded = null;
    renderBoard(
      [app({ id: 1, status: "rejected", pinned_at: "2026-08-12T10:00:00Z" })],
      { state: { showPinned: true } },
    );
    await waitFor(() => expect(headerFor("Rejected")).toBeTruthy());
    // Open columns, not rails: nothing is folded away while the filter is on.
    expect(railFor("Rejected")).toBeFalsy();
    expect(railFor("Archived")).toBeFalsy();
    expect(screen.getByText("Role 1")).toBeInTheDocument();
    // And the fold state itself is untouched — this is a view, not an edit.
    expect(savedFolded, "the pinned view must not rewrite the saved folds").toBeNull();
  });

  test("paints from the last known fold state, not the defaults", async () => {
    // The server copy is authoritative but arrives on a request. Painting
    // the defaults first meant the board rearranged itself a second after it
    // appeared — and a click in that window lands on the wrong column.
    localStorage.setItem("zenith_board_folded", "interested,applied");
    profileFolded = "interested,applied";
    renderBoard([]);
    // Synchronous first paint: no waitFor, because the point is that this is
    // true before anything resolves.
    expect(railFor("Interested")).toBeTruthy();
    expect(railFor("Applied")).toBeTruthy();
    expect(headerFor("Rejected")).toBeTruthy();
  });

  test("caches what the server says, so the next visit paints it", async () => {
    localStorage.removeItem("zenith_board_folded");
    profileFolded = "ghosted";
    renderBoard([]);
    await waitFor(() =>
      expect(localStorage.getItem("zenith_board_folded")).toBe("ghosted"),
    );
  });

  // Drag-and-drop is the board's headline interaction and had no coverage at
  // all: "a folded rail still accepts a dropped card" was asserted in the
  // design doc, in a code comment and in a PR body, and never once run.
  // Driving it through a real browser is possible but fragile — Playwright's
  // dragTo silently declined to arm HTML5 drag on one of the two paths and
  // reported the feature broken — so the contract is pinned here instead.
  function drop(target: Element, id: number) {
    const data = new Map([["text/plain", String(id)]]);
    const dataTransfer = {
      getData: (k: string) => data.get(k) ?? "",
      setData: (k: string, v: string) => void data.set(k, v),
      effectAllowed: "move",
    };
    const ev = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
    fireEvent(target, ev);
  }

  test("a folded live rail accepts a dropped card", async () => {
    // A folded live stage, because the four closed outcomes are one rail
    // now and that rail deliberately takes no drops: a card dropped on it
    // could mean rejected, withdrawn, ghosted or archived, and guessing
    // would be worse than declining. Open the group and each of the four
    // accepts drops exactly as before.
    profileFolded = "interested";
    const moves: [number, string][] = [];
    render(
      <MemoryRouter initialEntries={[{ pathname: "/board" }]}>
        <PipelineTab
          applications={[app({ id: 4, status: "applied" })]}
          companies={[]}
          contacts={[]}
          roleTypes={[]}
          onChanged={() => Promise.resolve()}
          onError={() => {}}
          notify={() => {}}
          onDelete={() => {}}
          onStatus={(id, status) => moves.push([id, status])}
          lastInteractions={[]}
          history={[]}
          onSaveOutcome={() => {}}
          onOpenJob={() => {}}
          onOpenQuickAdd={() => {}}
          onOpenSampleData={() => {}}
        />
      </MemoryRouter>,
    );
    // Asserted inside waitFor, not just returned from it: waitFor only
    // retries when its callback throws, so returning a null query resolves
    // immediately and the failure reads as "provide a DOM element".
    await waitFor(() => expect(railFor("Interested")).toBeTruthy());
    drop(railFor("Interested")!, 4);
    expect(moves).toEqual([[4, "interested"]]);
  });

  test("the closed group is not a drop target", async () => {
    // Deliberate, and the reason is in the component: four outcomes behind
    // one rail cannot say which one a drop meant.
    profileFolded = null;
    const moves: [number, string][] = [];
    render(
      <MemoryRouter initialEntries={[{ pathname: "/board" }]}>
        <PipelineTab
          applications={[app({ id: 6, status: "applied" })]}
          companies={[]}
          contacts={[]}
          roleTypes={[]}
          onChanged={() => Promise.resolve()}
          onError={() => {}}
          notify={() => {}}
          onDelete={() => {}}
          onStatus={(id, status) => moves.push([id, status])}
          lastInteractions={[]}
          history={[]}
          onSaveOutcome={() => {}}
          onOpenJob={() => {}}
          onOpenQuickAdd={() => {}}
          onOpenSampleData={() => {}}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(closedGroup()).toBeTruthy());
    drop(closedGroup()!, 6);
    expect(moves, "the group guessed an outcome for a dropped card").toEqual([]);
  });

  test("dropping a card on the rail it already sits on does nothing", async () => {
    profileFolded = "";
    const moves: [number, string][] = [];
    render(
      <MemoryRouter initialEntries={[{ pathname: "/board" }]}>
        <PipelineTab
          applications={[app({ id: 5, status: "applied" })]}
          companies={[]}
          contacts={[]}
          roleTypes={[]}
          onChanged={() => Promise.resolve()}
          onError={() => {}}
          notify={() => {}}
          onDelete={() => {}}
          onStatus={(id, status) => moves.push([id, status])}
          lastInteractions={[]}
          history={[]}
          onSaveOutcome={() => {}}
          onOpenJob={() => {}}
          onOpenQuickAdd={() => {}}
          onOpenSampleData={() => {}}
        />
      </MemoryRouter>,
    );
    const header = await waitFor(() => headerFor("Applied")!);
    drop(header.closest(".bcol")!, 5);
    expect(moves).toEqual([]);
  });

  test("arrow keys walk the stage strip, but not while typing", async () => {
    // The narrow board is a carousel; the arrows are how it is worked from a
    // keyboard. Verified in a browser (the board scrolls 0 → 312 → 661), but
    // the guard is the part worth pinning: without it, typing "→" in the
    // search box would scroll the board out from under the search.
    const narrow = ((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const real = window.matchMedia;
    window.matchMedia = narrow;
    try {
      profileFolded = "";
      const { container } = renderBoard([]);
      const current = () =>
        container.querySelector(".stage-chip[aria-current=true]")?.textContent?.trim();
      await waitFor(() => expect(current()).toContain("Interested"));

      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(current()).toContain("Applied");
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(current()).toContain("Interested");

      const search = container.querySelector("input.search")!;
      search.dispatchEvent(new FocusEvent("focus"));
      Object.defineProperty(document, "activeElement", {
        value: search,
        configurable: true,
      });
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(current()).toContain("Interested");
    } finally {
      window.matchMedia = real;
    }
  });

  test("puts the board back when the save is refused", async () => {
    // A fold that stays on screen after the server refused it reverts on the
    // next load with no explanation — and the paint cache, whose whole job is
    // to predict what the server will say, is left holding a value the server
    // refused.
    profileFolded = "";
    const errors: (string | null)[] = [];
    saveFails = true;
    renderBoard([], { onError: (m) => errors.push(m) });
    await waitFor(() => expect(headerFor("Offer")).toBeTruthy());

    fireEvent.click(headerFor("Offer")!);
    await waitFor(() => expect(errors).toEqual(["nope"]));
    expect(headerFor("Offer"), "the fold should have been undone").toBeTruthy();
    expect(localStorage.getItem("zenith_board_folded")).toBe("");
  });

  test("an empty board offers one way in, not one per stage", async () => {
    // Five identical primary buttons and no cards is a first-run screen
    // saying the same thing five times. The add blocks are for filing into a
    // particular stage, which needs a board to be working in first.
    profileFolded = "";
    renderBoard([]);
    await waitFor(() => expect(headerFor("Interested")).toBeTruthy());
    expect(
      screen.queryAllByRole("button", { name: "+ Add an application" }),
    ).toHaveLength(0);
  });

  test("the add block opens on the stage it sits in, and closed stages get none", async () => {
    profileFolded = "";
    const opened: (Status | undefined)[] = [];
    renderBoard([app({ id: 7, status: "applied" })], {
      onOpenQuickAdd: (s) => opened.push(s),
    });
    await waitFor(() => expect(headerFor("Screening")).toBeTruthy());
    const adds = screen.getAllByRole("button", { name: "+ Add an application" });
    // One per live stage: nothing is created straight into a closed stage or
    // the archive.
    expect(adds).toHaveLength(5);
    fireEvent.click(adds[2]);
    expect(opened).toEqual(["screening"]);
  });
});
