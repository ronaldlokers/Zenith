import * as React from "react";

/** One funnel step. */
export interface FunnelDatum {
  label: React.ReactNode;
  value: number;
  color?: string;
}

/**
 * Zenith funnel chart — aggregate conversion through ordered stages, with a
 * per-step drop-off %. An analytics view (data-viz palette), distinct from the
 * per-application StageStepper — it does not paint with the reserved `--st-*` ramp.
 */
export interface FunnelChartProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Steps top→bottom (widest first). */
  data: FunnelDatum[];
}

export function FunnelChart(props: FunnelChartProps): React.JSX.Element;
