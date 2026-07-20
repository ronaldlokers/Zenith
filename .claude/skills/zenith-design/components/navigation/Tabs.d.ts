import * as React from "react";

/**
 * Zenith section tabs — controlled screen-level switcher with a gold underline
 * on the active tab and optional neutral count pills. Parent owns `active`.
 * Arrow keys move between tabs (roving tabindex).
 */
export interface TabItem {
  /** Stable id passed to onChange. */
  key: string;
  label: string;
  /** Optional count pill. */
  count?: number;
}

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Tab list — strings (key === label) or `{key,label,count}`. */
  items: Array<string | TabItem>;
  /** Active tab key. */
  active: string;
  /** Fires with the newly selected key. */
  onChange?: (key: string) => void;
}

export function Tabs(props: TabsProps): React.JSX.Element;
