import type { HTMLAttributes, ReactNode } from "react";
import "./ActionBar.css";

// Extracted from the app's own button-row containers (.form-actions,
// .detail-actions, .share-actions): a flex row of actions, usually <Button>s.
// Not a design-system port — ActionBar.css fully describes the row AND
// re-homes the button normalization those containers used to apply (the
// compact Recipe-B metrics that Button's primary variant is deliberately
// unsized for), which previously lived in App.css + Button.css.
export interface ActionBarProps extends HTMLAttributes<HTMLDivElement> {
  /**
   *  - "form"   — form submit/cancel row (App.css .form-actions).
   *  - "detail" — modal action row; adds vertical margin (.detail-actions).
   *  - "share"  — share-link row; tighter gap (.share-actions).
   */
  variant?: "form" | "detail" | "share";
  children: ReactNode;
}

export function ActionBar({
  variant = "form",
  className,
  children,
  ...rest
}: ActionBarProps) {
  const classes = ["zui-actionbar", `zui-actionbar--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
