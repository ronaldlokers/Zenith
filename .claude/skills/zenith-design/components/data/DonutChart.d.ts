import * as React from "react";

/** One donut slice. */
export interface DonutDatum {
  label: React.ReactNode;
  value: number;
  color?: string;
}

/**
 * Zenith donut chart — part-to-whole (e.g. applications by source) as an SVG ring
 * with a centered total. Data-viz categorical palette (`--viz-*`), never stage
 * colors. Optional legend with per-slice percentages.
 */
export interface DonutChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: DonutDatum[];
  /** Diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  thickness?: number;
  /** Label under the centered total. */
  centerLabel?: React.ReactNode;
  /** Show the legend. */
  legend?: boolean;
}

export function DonutChart(props: DonutChartProps): React.JSX.Element;
