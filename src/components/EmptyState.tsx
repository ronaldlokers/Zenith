import type { ElementType, HTMLAttributes, ReactNode } from "react";
import "./EmptyState.css";

// Ported from the design system (components/feedback/EmptyState.jsx), reshaped
// to the app's actual .empty recipe: a centered muted caption under an
// optional icon, not the DS's own layout. EmptyState.css fully describes it —
// reproduces the App.css .empty recipe rather than depending on it (Storybook
// loads no App.css).
//
// `as` exists because .empty renders as two different elements depending on
// where it lives in the app: a standalone view uses `<p className="empty">`,
// but a `<ul>` of results with nothing in it renders its placeholder as
// `<li className="empty">` — a <p> can't legally live inside a <ul>, and a
// <li> can't legally live outside one, so the caller has to pick.
export interface EmptyStateProps extends HTMLAttributes<HTMLElement> {
  /** Which element to render as. Default "p" (standalone); "li" inside a <ul>. */
  as?: "p" | "li";
  /** Optional leading icon (svg) followed by the caption text. */
  children: ReactNode;
}

export function EmptyState({
  as = "p",
  className,
  children,
  ...rest
}: EmptyStateProps) {
  const El = as as ElementType;
  const classes = ["zui-emptystate", className].filter(Boolean).join(" ");
  return (
    <El className={classes} {...rest}>
      {children}
    </El>
  );
}
