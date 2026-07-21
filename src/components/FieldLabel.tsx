import type { HTMLAttributes, ReactNode } from "react";
import "./FieldLabel.css";

// Extracted from the app's own detail-modal caption (.field-label,
// App.css:854): a small uppercase mono label above an otherwise-bare value.
// Not a design-system port — FieldLabel.css fully describes the recipe
// rather than depending on it, because Storybook loads no App.css.
//
// Renders `display: block` even though it's a <span> — that matches the app
// exactly: .field-label is a span styled as a block-level caption, and this
// component reproduces that verbatim rather than "fixing" it to a <div>.
export interface FieldLabelProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function FieldLabel({ className, children, ...rest }: FieldLabelProps) {
  const classes = ["zui-fieldlabel", className].filter(Boolean).join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
