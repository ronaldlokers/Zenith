import type { KeyboardEvent } from "react";

// The ARIA tabs keyboard pattern, shared by TabBar and PillTabs so the two
// cannot drift. Both were ported as faithful copies of hand-rolled markup
// that never had it (#517).
//
// Automatic activation: an arrow key moves focus and selects in one press.
// The APG allows either that or manual activation (arrows move focus, Enter
// selects) and recommends automatic where switching is instant and free of
// side effects, which is the case for both call sites — the panels are local
// state, nothing is fetched.
//
// Roving tabindex comes with it and is the half that must not ship alone:
// marking inactive tabs tabIndex={-1} without arrow handling takes them out
// of the Tab order and leaves nothing that reaches them, which is worse than
// the plain-buttons state it replaces.
//
// Focus is moved directly on the element rather than left to a re-render
// effect. The button that had focus is about to become tabIndex={-1}, and
// browsers do not move focus when that happens — it would simply be lost.
export interface TablistKeyOptions<K extends string> {
  keys: K[];
  active: K;
  onSelect: (key: K) => void;
  /** The rendered tab buttons, by key. */
  refs: Map<K, HTMLElement | null>;
}

export function tablistKeyDown<K extends string>(
  event: KeyboardEvent<HTMLElement>,
  { keys, active, onSelect, refs }: TablistKeyOptions<K>,
): void {
  const from = keys.indexOf(active);
  if (from === -1) return;
  let to: number;
  switch (event.key) {
    case "ArrowRight":
      to = (from + 1) % keys.length;
      break;
    case "ArrowLeft":
      // Wrapping in both directions, which the APG lists as optional and
      // every tablist a person is likely to have used does.
      to = (from - 1 + keys.length) % keys.length;
      break;
    case "Home":
      to = 0;
      break;
    case "End":
      to = keys.length - 1;
      break;
    default:
      return;
  }
  // Only once the key is one this handles: an unhandled key must keep its
  // default, and Tab in particular has to stay able to leave the tablist.
  event.preventDefault();
  const next = keys[to];
  if (next === active) return;
  onSelect(next);
  refs.get(next)?.focus();
}
