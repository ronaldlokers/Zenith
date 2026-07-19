// Small shared hooks + the app-wide confirm() service, extracted from
// App.tsx (#285 split). No React components here, so react-refresh's
// only-export-components rule stays satisfied.
import { useEffect, useRef, useState } from "react";

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

// Styled confirm() for the whole app (#314) — call sites use the stable
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
