// The destination shortcuts are not a convenience — they are the reason
// hiding every destination behind the wordmark is defensible (#535 shell).
// There is no visual gate in CI for the shell work, so the behaviour that
// makes the design sound has to be covered here.
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { KEY_SHORTCUTS_KEY } from "./format";
import { useGlobalShortcuts } from "./hooks";

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
}

function handlers() {
  return {
    onTogglePalette: vi.fn(),
    onQuickAdd: vi.fn(),
    onGoToIndex: vi.fn(),
    onOpenSettings: vi.fn(),
    onToggleMenu: vi.fn(),
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
