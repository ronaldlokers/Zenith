import type { LiHTMLAttributes, ReactNode } from "react";
import "./Row.css";

// Extracted from the app's `card row2` list row (App.css:1550 + the .card
// base, App.css:1264) — a company/person row used in network.tsx:177 and
// :617. A container: the .l1/.l2 sub-structure is passed as children
// verbatim, so callers keep authoring `<div className="l1">...</div>`
// inside it. Activation (rowActivate: onClick/onKeyDown/role/tabIndex) is
// spread by the caller via ...rest — Row does not own activation.
// Row.css fully describes the look — reproduces the App.css recipe rather
// than depending on it (Storybook loads no App.css).
export interface RowProps extends LiHTMLAttributes<HTMLLIElement> {
  children: ReactNode;
}

export function Row({ className, children, ...rest }: RowProps) {
  const classes = ["zui-row", className].filter(Boolean).join(" ");
  return (
    <li className={classes} {...rest}>
      {children}
    </li>
  );
}
