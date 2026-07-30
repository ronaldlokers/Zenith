import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import "./SegmentedControl.css";

// Extracted from the app's list/grid toggle (.board-group-toggle,
// network.tsx:105 and :547) — the computed merge of two App.css rule sets:
// the base pill (App.css:2932) and the later "Segmented controls: one
// shape" reshape (App.css:4580), which wins per-property. A container: the
// segment <button>s are passed as children verbatim (raw buttons, not the
// Button component). SegmentedControl.css fully describes the look —
// reproduces the App.css recipe rather than depending on it (Storybook
// loads no App.css).
//
// SegmentedControl originally shipped container-only, on the theory that
// selection state and a11y are the caller's business. In practice five call
// sites hand-wrote the segment button, and they diverged: three set
// aria-pressed, one didn't — the omission went unnoticed because nothing
// forced the two to stay in sync. SegmentedControl.Item below owns both the
// `active` class and `aria-pressed` together, so a caller can no longer set
// one without the other. The container still spreads role="group" +
// aria-label via ...rest; only the item's own state moved in-house.
export interface SegmentedControlProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function SegmentedControl({
  className,
  children,
  ...rest
}: SegmentedControlProps) {
  const classes = ["zui-segmented", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export interface SegmentedItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected state — drives both the styling hook and aria-pressed. */
  active: boolean;
}

function Item({ active, className, type = "button", ...rest }: SegmentedItemProps) {
  const classes = [active ? "active" : null, className].filter(Boolean).join(" ");
  return <button type={type} className={classes || undefined} aria-pressed={active} {...rest} />;
}

SegmentedControl.Item = Item;
