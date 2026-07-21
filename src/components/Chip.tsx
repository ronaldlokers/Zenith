import type { HTMLAttributes, ReactNode } from "react";
import "./Chip.css";

// Extracted from the app's .keyword-chips .chip (App.css:2738): the keyword/tag
// pill used for skills, feed keywords, and application tags. A container, not
// a label component — the caller passes the label text and any remove/move
// <button> children verbatim (see detail.tsx's tag chips, which render two
// .chip-move buttons, the tag name, and a remove button as siblings inside the
// chip). Chip.css fully describes it — reproduces the App.css recipe rather
// than depending on it (Storybook loads no App.css).
export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Highlights the chip as matching a JD keyword search (App.css .chip.chip-matched). */
  matched?: boolean;
  children: ReactNode;
}

export function Chip({
  matched = false,
  className,
  children,
  ...rest
}: ChipProps) {
  const classes = [
    "zui-chip",
    matched ? "zui-chip--matched" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
