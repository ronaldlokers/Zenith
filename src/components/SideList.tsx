import type { HTMLAttributes, ReactNode } from "react";
import "./SideList.css";

// Extracted from the app's `.side-list` (App.css:3411) — the vertical list of
// stage-accented rows used in cv.tsx:167 and dashboard.tsx:218/355. A
// container: the <li> rows are passed as children verbatim, so callers keep
// authoring their own `stage-*` class on each <li> (that class sets --sc,
// which the border-left recipe below reads). One call site (dashboard.tsx:218)
// adds an extra "dash-recent" class alongside "side-list" — className
// passthrough handles it. SideList.css fully describes the look — it
// reproduces the App.css recipe rather than depending on it (Storybook loads
// no App.css).
export interface SideListProps extends HTMLAttributes<HTMLUListElement> {
  children: ReactNode;
}

export function SideList({ className, children, ...rest }: SideListProps) {
  const classes = ["zui-sidelist", className].filter(Boolean).join(" ");
  return (
    <ul className={classes} {...rest}>
      {children}
    </ul>
  );
}
