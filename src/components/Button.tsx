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
   *  - "primary"   — Recipe A, App.css:1218 button.primary.
   *  - "secondary" — Recipe B, App.css:4325 (.card-actions/.settings-modal/
   *    .shortcut-help button — .detail-actions/.form-actions/.share-actions
   *    moved to the owned ActionBar component).
   *  - "danger"    — Recipe B + a colour/border-colour override that App.css
   *    no longer carries (retired in 27ffc4e, "fix: retire the App.css
   *    secondary and danger recipes") — this file is now the only
   *    definition.
   *  - "ghost", "dark" — design-system additions, no current call sites.
   *  - "link"      — borderless underlined text link, ported from App.css's
   *    .linklike, retired in 568b29d ("feat: link + close Button variants
   *    from the app's own recipes (#403)") — this file is now the only
   *    definition.
   *  - "close"     — borderless × button in modal headers, ported from
   *    App.css's .modal-close, retired in the same commit (568b29d) — this
   *    file is now the only definition.
   */
  /**
   * Let a long label wrap instead of running past its container. Off by
   * default because a button that changes height is usually a layout bug —
   * but a label that leaves the viewport at 200% text is a worse one, and
   * WCAG 1.4.4 says so.
   */
  wrap?: boolean;
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
  wrap = false,
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
    wrap ? "zui-btn--wrap" : null,
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
