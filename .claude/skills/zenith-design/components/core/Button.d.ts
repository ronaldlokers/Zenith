import * as React from "react";

/**
 * Zenith action button. Gold `primary` is the single accent CTA; `default`
 * is the neutral surface button; `ghost` for low-emphasis; `dark` for a night
 * bg on light surfaces; `danger` for destructive actions. Corner --radius-md (10px).
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. */
  variant?: "default" | "primary" | "ghost" | "dark" | "danger";
  /** Control height / type scale. */
  size?: "sm" | "md" | "lg";
  /** Optional leading icon element (an <Icon/> or inline SVG). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): React.JSX.Element;
