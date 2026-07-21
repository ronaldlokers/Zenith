import type { HTMLAttributes, ReactNode } from "react";
import "./Badge.css";

// Ported from the design system (components/core/Badge.jsx), reshaped to the
// app's actual .badge recipe: a small uppercase mono outline pill, not the DS
// filled surface pill. Badge.css fully describes it — reproduces the App.css
// .badge recipe rather than depending on it (Storybook loads no App.css).
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   *  - "default" — accent outline (App.css .badge).
   *  - "warn"    — danger outline (App.css .badge.warn).
   *  - "stage"   — inherits the pipeline stage colour from a .stage-* ancestor
   *    via --sc (App.css .badge.stage). The palette is accessibility-locked;
   *    the component only reads the colour, never sets a hue.
   */
  variant?: "default" | "warn" | "stage";
  children: ReactNode;
}

export function Badge({
  variant = "default",
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = ["zui-badge", `zui-badge--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
