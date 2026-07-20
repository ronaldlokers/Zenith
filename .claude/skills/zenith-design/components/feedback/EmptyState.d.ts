import * as React from "react";

/**
 * Zenith empty-state panel — centered "nothing here yet" block for list views.
 * Pass one of the `Empty*Icon` components as `icon`. Keep copy to a short title
 * plus one supporting line; `action` is a single primary Button. Muted palette,
 * never stage colors.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Illustration — typically an Empty*Icon. */
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Single call-to-action. */
  action?: React.ReactNode;
}

export function EmptyState(props: EmptyStateProps): React.JSX.Element;
