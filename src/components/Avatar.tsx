import type { HTMLAttributes } from "react";
import "./Avatar.css";

// Ported from the design system (components/core/Avatar.jsx), reshaped to the
// app's only avatar recipe: a circular initials badge (App.css:4070,
// .side-user .avatar), not the DS's own layout. Avatar.css fully describes it
// — reproduces the App.css recipe rather than depending on it (Storybook
// loads no App.css).
export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** The initials shown, e.g. "RL". */
  initials: string;
}

export function Avatar({ initials, className, ...rest }: AvatarProps) {
  const classes = ["zui-avatar", className].filter(Boolean).join(" ");
  return (
    <span className={classes} {...rest}>
      {initials}
    </span>
  );
}
