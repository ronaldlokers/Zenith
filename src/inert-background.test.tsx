import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { useInertBackground } from "./hooks";

// The focus trap stops Tab, and that is all it stops. A screen reader's
// browse mode walks the document with arrow keys and the VoiceOver rotor
// lists every control on the page; neither follows the focus order.
//
// Measured with the quick-add dialog open: 27 controls outside it were still
// reachable, including the whole top bar, the board's search and its filter.
// Someone could operate the app behind a dialog they cannot see past.
let root: HTMLElement;

function shell() {
  const el = document.createElement("div");
  el.className = "top";
  root.appendChild(el);
  return el;
}

function backdrop() {
  const el = document.createElement("div");
  el.className = "modal-backdrop";
  root.appendChild(el);
  return el;
}

beforeEach(() => {
  root = document.createElement("div");
  root.className = "app";
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
});

describe("inert background", () => {
  test("takes the shell out of reach and puts it back", () => {
    const bar = shell();
    const { unmount } = renderHook(() => useInertBackground(true));
    expect(bar.hasAttribute("inert")).toBe(true);
    unmount();
    expect(bar.hasAttribute("inert")).toBe(false);
  });

  test("leaves the dialog itself alone", () => {
    // Applied to the siblings rather than the app root, because the backdrop
    // is a child of that root — inerting the root would inert the dialog
    // with everything else and leave nothing operable at all.
    const back = backdrop();
    renderHook(() => useInertBackground(true));
    expect(back.hasAttribute("inert")).toBe(false);
  });

  test("spares the branch the dialog is nested in", () => {
    // The notification panel hangs off the bottom bar rather than off a
    // backdrop of its own, so "skip the backdrop" would inert the bar and
    // take the panel out of reach with it — the dialog disabling itself.
    const bar = shell();
    const panel = document.createElement("div");
    const search = document.createElement("button");
    bar.append(search, panel);
    const other = shell();

    renderHook(() => useInertBackground(true, { current: panel }));
    expect(
      bar.hasAttribute("inert"),
      "the bar holds the dialog, so inerting it would disable the dialog",
    ).toBe(false);
    expect(other.hasAttribute("inert")).toBe(true);
    // Sparing the branch is not enough on its own: the bar's own controls sit
    // beside the open panel, and left alone they stayed reachable.
    expect(
      search.hasAttribute("inert"),
      "the bar's other controls are behind the panel, not part of it",
    ).toBe(true);
  });

  test("leaves a backdrop alone wherever it sits", () => {
    // inert takes pointer events with it, so an inerted backdrop is a modal
    // that click-outside no longer closes.
    const bar = shell();
    const back = document.createElement("div");
    back.className = "zui-notification-backdrop";
    const panel = document.createElement("div");
    bar.append(back, panel);

    renderHook(() => useInertBackground(true, { current: panel }));
    expect(back.hasAttribute("inert")).toBe(false);
  });

  test("does nothing when it is not active", () => {
    const bar = shell();
    renderHook(() => useInertBackground(false));
    expect(bar.hasAttribute("inert")).toBe(false);
  });

  test("a nested dialog does not wake the shell when it closes", () => {
    // The inner dialog finds the shell already inert, so it takes ownership
    // of nothing and has nothing to undo. Restoring blindly would let the
    // background back while the outer dialog is still open.
    const bar = shell();
    const outer = renderHook(() => useInertBackground(true));
    const inner = renderHook(() => useInertBackground(true));

    inner.unmount();
    expect(
      bar.hasAttribute("inert"),
      "the outer dialog is still open, so the shell must stay out of reach",
    ).toBe(true);

    outer.unmount();
    expect(bar.hasAttribute("inert")).toBe(false);
  });

  test("does not disturb something already inert for its own reasons", () => {
    // If the shell was inert before a dialog opened, it is not this hook's
    // to re-enable on close.
    const bar = shell();
    bar.setAttribute("inert", "");
    const { unmount } = renderHook(() => useInertBackground(true));
    unmount();
    expect(bar.hasAttribute("inert")).toBe(true);
  });
});
