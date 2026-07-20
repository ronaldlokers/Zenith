import * as React from "react";

/**
 * Zenith popover — anchored floating surface for filter panels and custom menus.
 * Self-managed open state; closes on outside-click and Escape. `trigger` can be
 * a node or a render fn (open) => node; `children` a node or a render fn
 * (close) => node.
 */
export interface PopoverProps extends React.HTMLAttributes<HTMLSpanElement> {
  trigger: React.ReactNode | ((open: boolean) => React.ReactNode);
  /** Horizontal edge alignment to the trigger. */
  align?: "start" | "end";
  /** Fixed panel width. */
  width?: number | string;
  children?: React.ReactNode | ((close: () => void) => React.ReactNode);
}
export function Popover(props: PopoverProps): React.JSX.Element;

/** One DropdownMenu row. */
export interface MenuItem {
  label?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  /** "danger" for destructive rows. */
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Render a separator instead of an item. */
  divider?: boolean;
}

/**
 * Action menu — a Popover preset rendering a list of items (the "⋯" menus).
 */
export interface DropdownMenuProps extends React.HTMLAttributes<HTMLSpanElement> {
  trigger: React.ReactNode | ((open: boolean) => React.ReactNode);
  items: MenuItem[];
  align?: "start" | "end";
  width?: number | string;
}
export function DropdownMenu(props: DropdownMenuProps): React.JSX.Element;
