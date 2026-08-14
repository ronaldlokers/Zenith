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
