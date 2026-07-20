import * as React from "react";

/**
 * Pipeline-stage pill. The ONLY component that paints with the
 * accessibility-locked stage palette (`--st-*`). Never use stage colors as
 * generic decoration; use this for application status only.
 */
export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Pipeline stage. */
  status?: "interested" | "applied" | "screening" | "interview" | "offer" | "rejected" | "withdrawn" | "ghosted";
  /** Show the leading color dot. */
  dot?: boolean;
  /** Override the default stage label. */
  children?: React.ReactNode;
}

export function StatusBadge(props: StatusBadgeProps): React.JSX.Element;
