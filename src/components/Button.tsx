import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

// Ported from the design system (components/core/Button.jsx), which expressed
// this as inline styles. Button.css is the complete description of how this
// looks — it must not lean on any App.css rule, because Storybook loads only
// the design tokens and the catalog has to match what ships.
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual emphasis.
   *  - "default"   — neutral surface + border (App.css's pre-existing base look).
   *  - "primary"   — Recipe A, App.css:1212 button.primary.
   *  - "secondary" — Recipe B, App.css:4649 (.card-actions/.detail-actions/
   *    .settings-modal/.shortcut-help/.form-actions/.share-actions button).
   *  - "danger"    — Recipe B + App.css:4693 colour/border-colour override.
   *  - "ghost", "dark" — design-system additions, no current call sites.
   *  - "link"      — borderless underlined text link (App.css:4542 .linklike).
   *  - "close"     — borderless × button in modal headers (App.css:846 .modal-close).
   */
  variant?:
    | "default"
    | "primary"
    | "secondary"
    | "ghost"
    | "dark"
    | "danger"
    | "link"
    | "close";
  /** Control height / type scale. */
  size?: "sm" | "md" | "lg";
  /** Optional leading icon element. */
  icon?: ReactNode;
}

export function Button({
  variant = "default",
  size = "md",
  icon,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "zui-btn",
    `zui-btn--${size}`,
    `zui-btn--${variant}`,
    // Gap only exists to space the `icon` prop from the label; applying it
    // unconditionally overrode the bespoke gap of app buttons whose own
    // layout class already spaces multi-element children (e.g. .top-add's
    // gap: 4px), making them wider. Only opt in when an icon is actually
    // rendered.
    icon ? "zui-btn--with-icon" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
