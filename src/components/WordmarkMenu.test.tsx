import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { WordmarkMenu } from "./WordmarkMenu";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const DESTS = [
  { id: "overview", label: "Today", shortcut: "1", icon: <svg />, count: 4, active: true },
  { id: "board", label: "Pipeline", shortcut: "2", icon: <svg />, count: 15, active: false },
  { id: "feed", label: "Feed", shortcut: "3", icon: <svg />, count: 5, active: false },
  { id: "companies", label: "People & companies", shortcut: "4", icon: <svg />, active: false },
  { id: "cv", label: "CV", shortcut: "5", icon: <svg />, active: false },
];

const ACTIONS = [
  { id: "add", label: "Add an application", shortcut: "C", icon: <svg />, active: false },
];

const noop = () => {};

function renderMenu(overrides: Partial<Parameters<typeof WordmarkMenu>[0]> = {}) {
  return render(
    <WordmarkMenu
      destinations={DESTS}
      actions={ACTIONS}
      onSelect={noop}
      onClose={noop}
      {...overrides}
    />,
  );
}

describe("WordmarkMenu", () => {
  test("shows every destination and action", () => {
    renderMenu();
    for (const d of [...DESTS, ...ACTIONS]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(d.label) })).toBeInTheDocument();
    }
  });

  test("puts the live count on a tile beside its shortcut", () => {
    // The spec asks tiles for "icon, label, live count and shortcut". The
    // component has always rendered the count; App.tsx went a long time
    // without passing one, so this fixture agreed with Storybook and not
    // with the app. Asserting it here keeps the component's half honest.
    renderMenu();
    expect(screen.getByText(/4 ·\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/15 ·\s*2/)).toBeInTheDocument();
    // A destination without one shows the shortcut alone, not "undefined ·".
    expect(screen.getByText(/^\s*4\s*$/)).toBeInTheDocument();
  });

  test("advertises the shortcut for every entry", () => {
    // The shortcuts being visible is what makes hiding the destinations
    // defensible — if this stops being true the design decision breaks.
    renderMenu();
    for (const d of [...DESTS, ...ACTIONS]) {
      expect(
        screen.getByRole("menuitem", { name: new RegExp(d.label) }),
      ).toHaveTextContent(d.shortcut);
    }
  });

  test("marks the active destination for assistive tech", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: /Today/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("menuitem", { name: /Pipeline/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("selecting reports the id, not the label", () => {
    const onSelect = vi.fn();
    renderMenu({ onSelect });
    fireEvent.click(screen.getByRole("menuitem", { name: /Pipeline/ }));
    expect(onSelect).toHaveBeenCalledWith("board");
  });

  test("Escape closes", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a click on the scrim closes, a click inside the panel does not", () => {
    const onClose = vi.fn();
    const { container } = renderMenu({ onClose });
    fireEvent.click(screen.getByRole("menu"));
    expect(onClose, "click inside the panel").not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".zui-menu-scrim")!);
    expect(onClose, "click on the scrim").toHaveBeenCalledTimes(1);
  });

  test("focuses the panel, not the first destination", () => {
    // Opened by keystroke as often as by click; focusing "Today" would make
    // a following Enter navigate somewhere the user never asked for.
    renderMenu();
    expect(document.activeElement).toBe(screen.getByRole("menu"));
  });
});
