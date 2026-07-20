import * as React from "react";

/** One bar. */
export interface BarDatum {
  label: React.ReactNode;
  value: number;
  /** Per-bar color override (data-viz token). */
  color?: string;
}

/**
 * Zenith bar / trend chart — dependency-free SVG-free div bars for counts or a
 * weekly trend. Uses the data-viz palette (`--viz-*`), never the reserved stage
 * ramp. Values scale to the series max.
 */
export interface BarChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: BarDatum[];
  /** Chart height in px. */
  height?: number;
  /** Single-series fill (data-viz token). */
  color?: string;
  /** Show value labels above bars. */
  showValues?: boolean;
}

export function BarChart(props: BarChartProps): React.JSX.Element;
