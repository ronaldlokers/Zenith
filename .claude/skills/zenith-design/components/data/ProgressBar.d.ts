import * as React from "react";

/**
 * Zenith determinate progress bar — profile completion, uploads, goals. Neutral
 * track with a gold fill by default; `tone` switches to a semantic fill. Not the
 * pipeline stepper — use StageStepper for pipeline state.
 */
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current value. */
  value: number;
  /** Max value (default 100). */
  max?: number;
  tone?: "accent" | "success" | "info" | "warning" | "danger";
  /** Label above the bar. */
  label?: React.ReactNode;
  /** Show the percent readout. */
  showValue?: boolean;
  /** Bar height in px. */
  size?: number;
}

export function ProgressBar(props: ProgressBarProps): React.JSX.Element;
