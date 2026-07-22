import type { LiHTMLAttributes, ReactNode } from "react";
import "./CvItem.css";

// Extracted from the app's `.cv-item` list item (App.css:3628) — the CV
// entry card used for work experience and education entries in cv.tsx:635
// and :856. A container: the .cv-item-head/.cv-item-actions sub-structure is
// passed as children verbatim, so callers keep authoring
// `<div className="cv-item-head">...<div className="cv-item-actions">...raw
// <button>s...</div></div>` inside it.
// CvItem.css fully describes the look — reproduces the App.css recipe rather
// than depending on it (Storybook loads no App.css).
export interface CvItemProps extends LiHTMLAttributes<HTMLLIElement> {
  children: ReactNode;
}

export function CvItem({ className, children, ...rest }: CvItemProps) {
  const classes = ["zui-cvitem", className].filter(Boolean).join(" ");
  return (
    <li className={classes} {...rest}>
      {children}
    </li>
  );
}
