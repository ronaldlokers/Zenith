import type { HTMLAttributes, ReactNode } from "react";
import "./StatLine.css";

// Extracted from the app's own dashboard stat line (.dash-stat, App.css:4756):
// a label/value row, stacked with a hairline border between rows and none
// above the first. Not a design-system port — StatLine.css fully describes
// the recipe rather than depending on it, because Storybook loads no
// App.css.
export interface StatLineProps extends HTMLAttributes<HTMLDivElement> {
  /** Left-hand caption. */
  label: ReactNode;
  /** Right-hand figure (mono, semi-bold). */
  value: ReactNode;
}

export function StatLine({ label, value, className, ...rest }: StatLineProps) {
  const classes = ["zui-statline", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      <span>{label}</span>
      <span className="zui-statline-value">{value}</span>
    </div>
  );
}
