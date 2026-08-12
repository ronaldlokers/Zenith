// The destination shortcuts are not a convenience — they are the reason
// hiding every destination behind the wordmark is defensible (#535 shell).
// There is no visual gate in CI for the shell work, so the behaviour that
// makes the design sound has to be covered here.
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { KEY_SHORTCUTS_KEY } from "./format";
import { useGlobalShortcuts } from "./hooks";

function press(key: string, init: KeyboardEventInit = {}) {
  // cancelable, so a listener can call preventDefault and a later one can
  // see that it did — which is the whole point of the yield test below.
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, cancelable: true, ...init }),
  );
}

function handlers() {
  return {
    onTogglePalette: vi.fn(),
    onQuickAdd: vi.fn(),
    onGoToIndex: vi.fn(),
    onOpenSettings: vi.fn(),
    onToggleMenu: vi.fn(),
    onShowClosed: vi.fn(),
    onShowPinned: vi.fn(),
  };
}

describe("global shortcuts", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
  });

  test("digits jump to that destination, 1-based", () => {
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("1");
    press("6");
    expect(h.onGoToIndex).toHaveBeenNthCalledWith(1, 1);
    expect(h.onGoToIndex).toHaveBeenNthCalledWith(2, 6);
  });

  test("comma opens settings and m toggles the menu", () => {
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press(",");
    press("m");
    expect(h.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(h.onToggleMenu).toHaveBeenCalledTimes(1);
  });

  test("p filters the board to what is pinned", () => {
    // The bottom bar's first slot prints a "p" keycap. A keycap that answers
    // to nothing is worse than no keycap — it is the reason the notification
    // slot deliberately has none — so the key and the print have to stay
    // together.
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("p");
    expect(h.onShowPinned).toHaveBeenCalledTimes(1);
  });

  test("p obeys the single-key setting, like every other bare key", () => {
    // WCAG 2.1.4: a bare letter that acts is a hazard for speech input and
    // single-switch users, so the whole class is switchable in settings.
    localStorage.setItem(KEY_SHORTCUTS_KEY, "off");
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("p");
    expect(h.onShowPinned).not.toHaveBeenCalled();
  });

  test("p does nothing while typing", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("p");
    expect(h.onShowPinned).not.toHaveBeenCalled();
  });

  test("c opens the closed applications, and it is not the feed's a", () => {
    // The feed has answered to "a" since #144 and prints it on its own help
    // line. A global fallback that steals a screen's key sends someone to
    // another page mid-triage — which is exactly what shipped in #555.
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("c");
    press("a");
    expect(h.onShowClosed).toHaveBeenCalledTimes(1);
  });

  test("yields a key that a screen already claimed", () => {
    // Registration order decides which window listener runs first, and that
    // depends on which mounted when. A fallback that acts on an event
    // someone already handled is a race with the router.
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    const claimer = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener("keydown", claimer, { capture: true });
    try {
      press("c");
      press("3");
      expect(h.onShowClosed).not.toHaveBeenCalled();
      expect(h.onGoToIndex).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", claimer, { capture: true });
    }
  });

  test("a modifier means the key belongs to the browser, not to us", () => {
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("1", { metaKey: true });
    press("1", { ctrlKey: true });
    press("1", { altKey: true });
    expect(h.onGoToIndex).not.toHaveBeenCalled();
  });

  test("does nothing while the user is typing", () => {
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    press("1");
    press(",");
    press("m");
    expect(h.onGoToIndex).not.toHaveBeenCalled();
    expect(h.onOpenSettings).not.toHaveBeenCalled();
    expect(h.onToggleMenu).not.toHaveBeenCalled();
  });

  test("respects the single-key opt-out (WCAG 2.1.4)", () => {
    // Speech input and single-switch users turn these off; a shortcut that
    // ignores the setting fires on dictated speech.
    localStorage.setItem(KEY_SHORTCUTS_KEY, "off");
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("1");
    press(",");
    press("m");
    expect(h.onGoToIndex).not.toHaveBeenCalled();
    expect(h.onOpenSettings).not.toHaveBeenCalled();
    expect(h.onToggleMenu).not.toHaveBeenCalled();
  });

  test("the palette chord still wins, and is not treated as a digit", () => {
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("k", { metaKey: true });
    expect(h.onTogglePalette).toHaveBeenCalledTimes(1);
    expect(h.onGoToIndex).not.toHaveBeenCalled();
  });

  test("quick-add on n still works alongside the new keys", () => {
    const h = handlers();
    renderHook(() => useGlobalShortcuts(h));
    press("n");
    expect(h.onQuickAdd).toHaveBeenCalledTimes(1);
  });
});
