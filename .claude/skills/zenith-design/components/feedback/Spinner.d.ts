import * as React from "react";

/**
 * Zenith loading states. `Spinner` is a gold-arc ring for inline/button busy
 * states; `Skeleton` is a shimmering placeholder sized to the element it stands
 * in for. Both flatten under prefers-reduced-motion.
 */
export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Diameter in px. */
  size?: number;
  /** Ring stroke width in px. */
  thickness?: number;
}
export function Spinner(props: SpinnerProps): React.JSX.Element;

export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  width?: number | string;
  height?: number | string;
  /** Corner radius (ignored when `circle`). */
  radius?: string;
  /** Render a circle sized to `height`. */
  circle?: boolean;
}
export function Skeleton(props: SkeletonProps): React.JSX.Element;
