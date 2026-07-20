import * as React from "react";

/**
 * Zenith toast — transient confirmation / alert. Surface card (shadow-2) with a
 * leading semantic accent bar + icon. Presentational: render one or stack a few
 * bottom-right and own dismissal in the parent. Set `duration` (ms) with
 * `onDismiss` for auto-dismiss. Semantic colors only — never stage colors.
 */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  kind?: "success" | "info" | "warning" | "danger";
  /** Bold headline. */
  title?: React.ReactNode;
  /** Supporting line. */
  message?: React.ReactNode;
  /** Shows the × and enables auto-dismiss. */
  onDismiss?: () => void;
  /** Auto-dismiss after N ms (0 = sticky). */
  duration?: number;
}

export function Toast(props: ToastProps): React.JSX.Element;
