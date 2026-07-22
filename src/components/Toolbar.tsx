import type { HTMLAttributes, ReactNode } from "react";
import "./Toolbar.css";

// Extracted from the app's own toolbar row (.toolbar): a wrap-friendly flex
// header of a search field + actions. Not a design-system port — Toolbar.css
// fully describes the row AND re-homes the control normalization the .toolbar
// container applied to its children (the search field, one control height for
// every input/select/button, and the mobile touch-target/full-width-search
// behaviour), which previously lived in App.css.
export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Toolbar({ className, children, ...rest }: ToolbarProps) {
  const classes = ["zui-toolbar", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
