import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import axe from "axe-core";
import { BottomBar } from "./shell";
import { Row } from "./components";
import { PipelineTab } from "./board";
import type { Application, Profile, Status } from "./types";
import "./i18n";

vi.mock("./api", () => ({
  api: {
    notifications: () =>
      Promise.resolve([
        { id: 1, title: "Follow up with Acme", body: "Due today", url: "/board/1", read_at: null, created_at: iso(-1) },
        { id: 2, title: "Interview tomorrow", body: null, url: "/board/2", read_at: iso(-2), created_at: iso(-2) },
      ]),
    markNotificationsRead: () => Promise.resolve(undefined),
    profile: () => Promise.resolve({ board_folded: "" } as Profile),
    setBoardFolded: () => Promise.resolve({ board_folded: [] }),
    savedViews: () => Promise.resolve([]),
    updateFollowUp: () => Promise.resolve(undefined),
    archiveApplication: () => Promise.resolve(undefined),
    unarchiveApplication: () => Promise.resolve(undefined),
  },
}));

const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

function app(over: Partial<Application> & { id: number }): Application {
  return {
    company_id: null, contact_id: null, title: `Role ${over.id}`,
    role_type: "platform-engineer", status: "applied" as Status, source: null,
    url: null, notes: null, next_action: null, next_action_at: null,
    applied_at: iso(-5), archived_at: null, pinned_at: null, fit_score: null,
    salary_min: null, salary_max: null, salary_currency: null, tags: [],
    created_at: iso(-10), updated_at: iso(-1), ...over,
  } as Application;
}

// Three times this session a structural a11y defect was fixed, guarded by a
// source check, and then found again somewhere the check did not look: the
// focus ring in two component stylesheets the guard never read, role="button"
// on an <li> in four places the guard's <Row> pattern did not match. Each
// guard encoded the shape of the instance in hand rather than the rule.
//
// axe evaluates the rendered markup, so it does not need to be told where to
// look. What it cannot do here is anything that depends on CSS: jsdom applies
// none, so colour, focus visibility, and a name hidden by display: none are
// all invisible to it. Those stay with the browser sweep. Roles, list
// structure, labels and ARIA validity do not need layout, and that is the
// family every one of the guards above got wrong.
// https://github.com/chaance/vitest-axe
const STRUCTURAL = [
  "aria-allowed-attr",
  "aria-allowed-role",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-valid-attr-value",
  "button-name",
  "link-name",
  "list",
  "listitem",
  "definition-list",
  "dlitem",
  "duplicate-id-aria",
  "form-field-multiple-labels",
  "label",
  "nested-interactive",
  "presentation-role-conflict",
];

async function violations(el: HTMLElement) {
  const results = await axe.run(el, {
    runOnly: { type: "rule", values: STRUCTURAL },
    resultTypes: ["violations"],
  });
  return results.violations.map(
    (v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ")}`,
  );
}

describe("structural accessibility", () => {
  test("the bottom bar is structurally sound", async () => {
    // Deliberately not claiming to pin the button-name defect that was found
    // here. That one exists only because CSS hides the label below 700px, and
    // jsdom applies no CSS — removing the aria-labels again leaves this test
    // green, which was checked rather than assumed. shell.test.tsx guards it
    // by asserting the exact accessible name; the browser sweep is what saw
    // it in the first place.
    const { container } = render(
      <MemoryRouter>
        <BottomBar onSearch={() => {}} onPinned={() => {}} pinnedCount={3} />
      </MemoryRouter>,
    );
    expect(await violations(container)).toEqual([]);
  });

  test("an activatable row keeps the list it sits in", async () => {
    // role="button" on the <li> overrides listitem, and the <ul> then reports
    // a list with no items. Found in five places; this is the shape they all
    // shared, so it fails here regardless of which component grows it next.
    const { container } = render(
      <ul>
        <Row>
          <div role="button" tabIndex={0}>
            <div className="l1">Acme</div>
          </div>
        </Row>
      </ul>,
    );
    expect(await violations(container)).toEqual([]);
  });

  test("the board's real markup is structurally sound", async () => {
    // Not a contrived row: the component as the app renders it, with cards,
    // rails, the toolbar and the fold controls. This is what makes the guard
    // worth more than the source checks it backs up — it sees whatever the
    // component actually emits, including parts nobody thought to check.
    const { container } = render(
      <MemoryRouter initialEntries={["/board"]}>
        <PipelineTab
          applications={[app({ id: 1 }), app({ id: 2, status: "offer" })]}
          companies={[]}
          roleTypes={[]}
          onChanged={() => Promise.resolve()}
          onError={() => {}}
          notify={() => {}}
          onStatus={() => {}}
          lastInteractions={[]}
          history={[]}
          onOpenJob={() => {}}
          onOpenQuickAdd={() => {}}
          onOpenSampleData={() => {}}
        />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(container.querySelector("[data-card-id]")).toBeTruthy(),
    );
    expect(await violations(container)).toEqual([]);
  });

  test("the notification panel keeps its list when open", async () => {
    // The defect this pins was invisible until the panel was opened: axe on
    // the page at rest never saw it, because the list is not in the document
    // until the bell is pressed.
    const { container, getByRole } = render(
      <MemoryRouter>
        <BottomBar onSearch={() => {}} onPinned={() => {}} pinnedCount={0} />
      </MemoryRouter>,
    );
    const bell = await waitFor(() =>
      getByRole("button", { name: /notification/i }),
    );
    fireEvent.click(bell);
    await waitFor(() =>
      expect(container.querySelector(".zui-notification-list li")).toBeTruthy(),
    );
    expect(await violations(container)).toEqual([]);
  });

  test("catches the mistake it was written for", async () => {
    // Guard on the guard. The previous test passes trivially if the rule set
    // is wrong or axe is not really running, so this asserts the same markup
    // with the role back on the <li> is reported.
    const { container } = render(
      <ul>
        <Row role="button" tabIndex={0}>
          <div className="l1">Acme</div>
        </Row>
      </ul>,
    );
    const found = await violations(container);
    expect(found.join(" ")).toMatch(/aria-allowed-role|list/);
  });
});
