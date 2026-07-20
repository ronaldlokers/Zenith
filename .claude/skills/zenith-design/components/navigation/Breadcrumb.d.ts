import * as React from "react";

/** One breadcrumb node. */
export interface Crumb {
  label: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Zenith breadcrumb — back-navigation trail. All but the last item are gold
 * links; the last is the muted, non-interactive current page.
 */
export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: Crumb[];
}

export function Breadcrumb(props: BreadcrumbProps): React.JSX.Element;
