import * as React from "react";

/**
 * The Ascent — pipeline progress stepper across the five stages
 * (interested → applied → screening → interview → offer). Completed and current
 * stages fill with their locked stage hue; upcoming stages stay on neutral track.
 * This and StatusBadge are the only components allowed to paint with stage colors.
 * Deuteranopia-safe; always pairs color with the stage label.
 */
export interface StageStepperProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current stage key. */
  current?: "interested" | "applied" | "screening" | "interview" | "offer";
  /** Rejected / withdrawn / ghosted — greys the whole track. */
  dead?: boolean;
}

export function StageStepper(props: StageStepperProps): React.JSX.Element;
