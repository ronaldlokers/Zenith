import * as React from "react";
import type { MenuItem } from "./Popover";

/**
 * Zenith context menu — right-click actions on pipeline cards. Wraps any child;
 * right-click opens a menu at the cursor with the same visual language as
 * DropdownMenu. Closes on outside-click, Escape, scroll, or selection.
 */
export interface ContextMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rows — reuses DropdownMenu's MenuItem shape (supports `divider`, `tone`). */
  items: MenuItem[];
  children?: React.ReactNode;
}

export function ContextMenu(props: ContextMenuProps): React.JSX.Element;
