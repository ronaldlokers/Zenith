import * as React from "react";

/**
 * Zenith top bar — the surface header opening each screen: serif title, free
 * children in the middle (badges, search field), and a right-aligned `actions`
 * slot for buttons. Pair with Sidebar to form the app shell.
 */
export interface TopBarProps extends React.HTMLAttributes<HTMLElement> {
  /** Serif page title. */
  title?: React.ReactNode;
  /** Right-aligned action buttons. */
  actions?: React.ReactNode;
}

export function TopBar(props: TopBarProps): React.JSX.Element;
