import * as React from "react";

/**
 * Small uppercase pill label for counts, flags, and meta chrome. Full-radius.
 * For pipeline stage state use `StatusBadge` (its colors are locked); `Badge`
 * is for everything else.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** `default` neutral, `accent` soft-teal, `warn` gone-quiet heat. */
  variant?: "default" | "accent" | "warn";
  children?: React.ReactNode;
}

export function Badge(props: BadgeProps): React.JSX.Element;
