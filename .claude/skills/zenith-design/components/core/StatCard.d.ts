import * as React from "react";

/**
 * Zenith KPI tile for dashboards. Neutral surface; the delta is the only
 * colored element (success up / danger down / muted flat). Set `accent` for
 * the single hero metric — renders value + icon in gold.
 */
export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Uppercase eyebrow label. */
  label: string;
  /** Primary figure (string or number). */
  value: React.ReactNode;
  /** Change readout, e.g. "12%" or "+4". */
  delta?: React.ReactNode;
  /** Direction of the delta. */
  trend?: "up" | "down" | "flat";
  /** Optional trailing icon. */
  icon?: React.ReactNode;
  /** Gold hero treatment. */
  accent?: boolean;
}

export function StatCard(props: StatCardProps): React.JSX.Element;
