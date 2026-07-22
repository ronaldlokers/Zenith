// Small shared hooks + the app-wide confirm() service, extracted from
// App.tsx (#285 split). No React components here, so react-refresh's
// only-export-components rule stays satisfied.
import { useEffect, useRef, useState } from "react";
import { keyShortcutsEnabled } from "./format";

// Guards an async submit against double-fire (#261) and exposes a busy
// flag for disabling the button. The wrapped handler already returns a
// promise (the api chain), so we just await it and reset when it settles.
export function useSubmitGuard<T>(onSubmit: (value: T) => void | Promise<void>) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async (value: T) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(value);
    } finally {
      setSubmitting(false);
    }
  };
  return [submitting, submit] as const;
}

// Makes a non-button clickable row keyboard-operable (#261): announces as
// a button and fires the same action on Enter/Space. Spread onto the
// element that carries the row's onClick.
export function rowActivate(onActivate: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  } as const;
}

// Dialog focus management (#261) — moves focus into the dialog on open and
// traps Tab within it, so keyboard/AT users can't tab out to the page
// behind the modal. Attach the returned ref to the dialog element.
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const selector =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null,
      );
    // Remember where focus came from — closing a dialog must return the
    // keyboard user to their place, not drop them at <body> (#346).
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusable();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [active]);
  return ref;
}

// True once the page has scrolled off the top (#126). Drives the sticky
// header divider — with nothing scrolled the header matches the page
// background and there's no seam until this fires.
export function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

// Keeps the active mobile tab in view on every switch (#48/#204). The tab
// bar has more tabs than fit at 390px and scrolls horizontally; a deep
// link or the palette can land on a tab scrolled off-screen with no cue
// it's selected. Attach the returned ref to the scrolling <nav>.
export function useScrollActiveTabIntoView(tab: string) {
  const tabsRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const active = tabsRef.current?.querySelector(
      `[data-tab="${tab}"]`,
    ) as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);
  return tabsRef;
}

// Defensive fallback for mobile browsers whose dynamic address-bar resize
// can leave `position: fixed; bottom: 0` anchored below the visible area
// (#91) — tracks the real gap between the layout and visual viewport and
// exposes it as --vv-bottom-offset for .tabs to read instead of assuming
// bottom: 0 is always correct.
export function useViewportBottomOffset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const setOffset = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      document.documentElement.style.setProperty(
        "--vv-bottom-offset",
        `${Math.max(0, offset)}px`,
      );
    };
    setOffset();
    vv.addEventListener("resize", setOffset);
    vv.addEventListener("scroll", setOffset);
    return () => {
      vv.removeEventListener("resize", setOffset);
      vv.removeEventListener("scroll", setOffset);
    };
  }, []);
}

// Global keyboard shortcuts: ⌘/Ctrl-K toggles the command palette; bare "n"
// opens quick-add unless the user is typing in a field or shortcuts are
// disabled in settings.
export function useGlobalShortcuts(handlers: {
  onTogglePalette: () => void;
  onQuickAdd: () => void;
}) {
  // Keep the listener bound once (like the original App effect): stash the
  // latest handlers in a ref so fresh closures from each render don't force
  // a re-subscribe.
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current.onTogglePalette();
      } else if (
        e.key === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        keyShortcutsEnabled()
      ) {
        const el = document.activeElement as HTMLElement | null;
        if (
          el &&
          (el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.tagName === "SELECT" ||
            el.isContentEditable)
        )
          return;
        e.preventDefault();
        ref.current.onQuickAdd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// requestConfirm(); ConfirmHost installs the real implementation via
// setConfirmImpl, so nothing reassigns an imported binding.
let confirmImpl: (message: string) => Promise<boolean> = (message) =>
  Promise.resolve(window.confirm(message));

export function setConfirmImpl(
  fn: (message: string) => Promise<boolean>,
): void {
  confirmImpl = fn;
}

export function requestConfirm(message: string): Promise<boolean> {
  return confirmImpl(message);
}
