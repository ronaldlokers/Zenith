import * as React from "react";

/**
 * Zenith tooltip — short hover/focus label on a trigger. Night surface bubble
 * with a caret, shown after `delay` ms. Wrap any focusable element; keep copy
 * to a few words (use a Popover for anything longer). Self-contained state.
 */
export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Bubble text. */
  label: React.ReactNode;
  position?: "top" | "bottom";
  /** Hover-in delay in ms. */
  delay?: number;
  children?: React.ReactNode;
}

export function Tooltip(props: TooltipProps): React.JSX.Element;
