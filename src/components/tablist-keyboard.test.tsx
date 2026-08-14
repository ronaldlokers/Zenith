import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar";
import { PillTabs } from "./PillTabs";

// #517 said the blocker was that nothing in the rig could see focus order or
// key handling, and asked for the check to be built before the behaviour.
// This is that check.
//
// Its own file: focus assertions read document.activeElement, which is shared
// across every test in a spec file, and a stray focused node from an earlier
// render makes them fail for reasons unrelated to the component.

const TABS = [
  { key: "a" as const, label: "Overview" },
  { key: "b" as const, label: "Notes" },
  { key: "c" as const, label: "Documents" },
];

function Harness({ kind }: { kind: "tabbar" | "pills" }) {
  const [active, setActive] = useState<"a" | "b" | "c">("a");
  const props = {
    tabs: TABS,
    active,
    onSelect: setActive,
    "aria-label": "Sections",
  };
  return kind === "tabbar" ? (
    <TabBar {...props} idPrefix="detail" />
  ) : (
    <PillTabs {...props} />
  );
}

for (const kind of ["tabbar", "pills"] as const) {
  describe(`${kind} keyboard`, () => {
    it("puts only the active tab in the Tab order", async () => {
      // Roving tabindex. This is the half that must not ship alone: without
      // arrow handling it takes the inactive tabs out of the Tab order and
      // leaves nothing that reaches them.
      render(<Harness kind={kind} />);
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("tabindex", "-1");
    });

    it("moves focus and selection with the arrow keys", async () => {
      const user = userEvent.setup();
      render(<Harness kind={kind} />);
      await user.tab();
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();

      await user.keyboard("{ArrowRight}");
      const notes = screen.getByRole("tab", { name: "Notes" });
      expect(notes, "focus stayed behind when the arrow moved selection").toHaveFocus();
      expect(notes).toHaveAttribute("aria-selected", "true");
    });

    it("wraps at both ends", async () => {
      const user = userEvent.setup();
      render(<Harness kind={kind} />);
      await user.tab();
      await user.keyboard("{ArrowLeft}");
      expect(screen.getByRole("tab", { name: "Documents" })).toHaveFocus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
    });

    it("jumps to the ends with Home and End", async () => {
      const user = userEvent.setup();
      render(<Harness kind={kind} />);
      await user.tab();
      await user.keyboard("{End}");
      expect(screen.getByRole("tab", { name: "Documents" })).toHaveFocus();
      await user.keyboard("{Home}");
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
    });

    it("still leaves the tablist with Tab", async () => {
      // The keys this does not handle must keep their default. A tablist that
      // swallows Tab is a keyboard trap.
      const user = userEvent.setup();
      render(
        <>
          <Harness kind={kind} />
          <button type="button">After</button>
        </>,
      );
      await user.tab();
      await user.tab();
      expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    });

    it("takes the keys it handles, and only those", () => {
      // Home and End scroll the document by default, so a tablist that reads
      // them without preventing it jumps the page to the bottom while moving
      // the tab. jsdom implements no scrolling, so the scroll itself cannot
      // be observed here — what can is whether the default was prevented,
      // which is the thing the browser acts on.
      render(<Harness kind={kind} />);
      const first = screen.getByRole("tab", { name: "Overview" });
      expect(
        fireEvent.keyDown(first, { key: "End" }),
        "End was read but its default left in place",
      ).toBe(false);
      expect(
        fireEvent.keyDown(screen.getByRole("tab", { name: "Documents" }), {
          key: "ArrowLeft",
        }),
      ).toBe(false);
      // A key it does not handle keeps its default, or Tab could not leave.
      expect(
        fireEvent.keyDown(screen.getByRole("tab", { name: "Notes" }), {
          key: "Tab",
        }),
        "a key the tablist does not handle had its default taken",
      ).toBe(true);
    });

    it("still selects with a click", async () => {
      const user = userEvent.setup();
      render(<Harness kind={kind} />);
      await user.click(screen.getByRole("tab", { name: "Documents" }));
      expect(screen.getByRole("tab", { name: "Documents" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });
}

describe("TabBar's panel wiring", () => {
  it("points only the active tab at a panel, since only that one is rendered", () => {
    // Emitting aria-controls for every tab left two of three pointing at ids
    // that do not exist on any render (#517).
    render(<Harness kind="tabbar" />);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-controls",
      "detail-panel-a",
    );
    expect(
      screen.getByRole("tab", { name: "Notes" }),
      "a tab pointed at a panel that is not rendered",
    ).not.toHaveAttribute("aria-controls");
  });
});

describe("an unknown active key", () => {
  it("does not move focus rather than throwing", () => {
    // Defensive: a caller passing a key that is not in the list would
    // otherwise index at -1 and wrap to the end on the first arrow press.
    const onSelect = vi.fn();
    render(
      <TabBar
        tabs={TABS}
        active={"zzz" as unknown as "a"}
        onSelect={onSelect}
        idPrefix="detail"
        aria-label="Sections"
      />,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
});
