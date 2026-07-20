import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

// Ported from the design system (components/core/Button.jsx), which expressed
// this as inline styles. Button.css is the complete description of how this
// looks — it must not lean on any App.css rule, because Storybook loads only
// the design tokens and the catalog has to match what ships.
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. */
  variant?: "default" | "primary" | "ghost" | "dark" | "danger";
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
  const classes = ["zui-btn", `zui-btn--${size}`, `zui-btn--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
