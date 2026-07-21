import type { HTMLAttributes, ReactNode } from "react";
import "./SegmentedControl.css";

// Extracted from the app's list/grid toggle (.board-group-toggle,
// network.tsx:105 and :547) — the computed merge of two App.css rule sets:
// the base pill (App.css:2932) and the later "Segmented controls: one
// shape" reshape (App.css:4580), which wins per-property. A container: the
// segment <button>s are passed as children verbatim (raw buttons, not the
// Button component). The caller keeps `className={active ? "active" : ""}`
// on the selected button and spreads role="group" + aria-label via ...rest
// — SegmentedControl does not own selection state or a11y grouping.
// SegmentedControl.css fully describes the look — reproduces the App.css
// recipe rather than depending on it (Storybook loads no App.css).
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
