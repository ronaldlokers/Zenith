import * as React from "react";

/** One command palette entry. */
export interface CommandItem {
  /** Stable id (falls back to label). */
  id?: string;
  label: string;
  /** Trailing hint / secondary text. */
  hint?: string;
  icon?: React.ReactNode;
  /** Invoked on select. */
  onRun?: () => void;
}

/** A labeled group of commands. */
export interface CommandGroup {
  label: string;
  items: CommandItem[];
}

/**
 * Zenith command palette — the ⌘K overlay (extracted from AppChrome). Scrim +
 * centered surface with a filterable, grouped result list. ↑/↓ move, Enter runs,
 * Escape closes. Controlled by `open`; the parent owns the ⌘K shortcut wiring.
 */
export interface CommandPaletteProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  groups: CommandGroup[];
  onClose?: () => void;
  placeholder?: string;
  emptyText?: string;
}

export function CommandPalette(props: CommandPaletteProps): React.JSX.Element | null;
