// Small shared hooks + the app-wide confirm() service, extracted from
// App.tsx (#285 split). No React components here, so react-refresh's
// only-export-components rule stays satisfied.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keyShortcutsEnabled } from "./format";

// Marks that a chunk-load failure has already triggered one reload this
// session. Lives here rather than beside the boundary that uses it because
// this file exports no components, which is what keeps react-refresh's
// only-export-components rule satisfied.
//
// sessionStorage rather than state: a reload discards state by definition,
// so an in-memory counter would permit an infinite reload loop — a worse
// failure than the white page being handled.
export const CHUNK_RETRY_KEY = "zenith_chunk_reload";

// Cleared once the app has mounted, so the one-shot reload is available
// again for the next deploy rather than being spent for the session.
export function clearChunkRetry(): void {
  try {
    sessionStorage.removeItem(CHUNK_RETRY_KEY);
  } catch {
    /* storage disabled; nothing to clear */
  }
}

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
  // Captured at render, not in the effect below, and that is the whole point.
  // React applies a child's autoFocus during commit — before any effect runs
  // — so an effect that reads document.activeElement finds the dialog's own
  // first field and records *that* as the opener. On close the field is
  // already detached, document.contains() says so, nothing is restored, and
  // focus falls to <body>: the keyboard user is dropped at the top of the
  // page. At render time the dialog has not mounted, so this is still the
  // control they activated. Measured — quick-add landed on <body>, the
  // command palette (which focuses in an effect) did not.
  // Re-captured on each closed→open transition, so a dialog opened twice from
  // two different controls goes back to the right one. Deliberately not
  // cleared on close: the render that flips active to false happens *before*
  // the effect cleanup that restores focus, so clearing there would leave
  // nothing to restore — measured on the notification panel, which closed to
  // <body> until this was a transition rather than a reset.
  const opener = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);
  // Two shapes to serve, and one capture rule covers both. A dialog that
  // mounts when it opens is captured on its first render; a panel that stays
  // mounted and toggles the trap is captured on each closed→open transition,
  // so opening it from two different controls goes back to the right one.
  if (active && !wasActive.current && typeof document !== "undefined") {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }
  wasActive.current = active;
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
      // Closing a dialog must return the keyboard user to their place, not
      // drop them at <body> (#346).
      const back = opener.current;
      if (back && document.contains(back)) back.focus();
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
  /** Jump to the nth destination (1-based, as the keycaps read). */
  onGoToIndex?: (index: number) => void;
  onOpenSettings?: () => void;
  onToggleMenu?: () => void;
  onShowClosed?: () => void;
  /** The bottom bar's first slot prints a "p" keycap; this is what it does. */
  onShowPinned?: () => void;
}) {
  // Keep the listener bound once (like the original App effect): stash the
  // latest handlers in a ref so fresh closures from each render don't force
  // a re-subscribe.
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A screen that owns a key gets to keep it. These are app-wide
      // fallbacks, and a feature handler that already called preventDefault
      // has said the keystroke was for it — acting anyway is how the feed's
      // "a" started navigating people off the feed mid-triage.
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current.onTogglePalette();
        return;
      }

      // Destination shortcuts (#535 shell). Same guards as the quick-add key
      // below: no modifiers, not while typing, and off entirely when the
      // single-key setting is disabled for speech-input and single-switch
      // users (WCAG 2.1.4).
      if (!e.metaKey && !e.ctrlKey && !e.altKey && keyShortcutsEnabled()) {
        const el = document.activeElement as HTMLElement | null;
        const typing =
          !!el &&
          (el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.tagName === "SELECT" ||
            el.isContentEditable);
        if (!typing) {
          if (e.key >= "1" && e.key <= "9" && ref.current.onGoToIndex) {
            e.preventDefault();
            ref.current.onGoToIndex(Number(e.key));
            return;
          }
          if (e.key === "," && ref.current.onOpenSettings) {
            e.preventDefault();
            ref.current.onOpenSettings();
            return;
          }
          if (e.key === "c" && ref.current.onShowClosed) {
            e.preventDefault();
            ref.current.onShowClosed();
            return;
          }
          if (e.key === "p" && ref.current.onShowPinned) {
            e.preventDefault();
            ref.current.onShowPinned();
            return;
          }
          if (e.key === "m" && ref.current.onToggleMenu) {
            e.preventDefault();
            ref.current.onToggleMenu();
            return;
          }
        }
      }

      if (
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

// Routes the app in place when the service worker relays a notification tap
// (`{type:"notification-navigate", url}`). The SW focuses the running window
// and posts this instead of calling WindowClient.navigate(), which is
// unreliable on iOS — here react-router does the actual navigation.
export function useNotificationNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type === "notification-navigate" && typeof data.url === "string") {
        navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);
}
