import * as React from "react";

/** A segmented-control option. */
export interface SegmentOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * Zenith segmented control — compact 2–4 option view switch (Board/List/
 * Calendar). Sunken track with a gold-text active segment. Controlled: parent
 * owns `value` and `onChange`.
 */
export interface SegmentedControlProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Options — strings or {value,label,icon}. */
  options: Array<string | SegmentOption>;
  /** Active value. */
  value: string;
  /** Fires with the selected value. */
  onChange?: (value: string) => void;
  size?: "sm" | "md";
}

export function SegmentedControl(props: SegmentedControlProps): React.JSX.Element;
