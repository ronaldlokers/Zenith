import * as React from "react";

/**
 * Zenith alert / banner — persistent inline page-level message (distinct from
 * the transient Toast). Semantic tint + accent border with a leading icon,
 * optional title, action, and dismiss. Semantic colors only — never stage.
 */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  kind?: "info" | "success" | "warning" | "danger";
  title?: React.ReactNode;
  /** Body content. */
  children?: React.ReactNode;
  /** Shows the × when provided. */
  onDismiss?: () => void;
  /** Trailing action row (e.g. a Button). */
  action?: React.ReactNode;
}

export function Alert(props: AlertProps): React.JSX.Element;
