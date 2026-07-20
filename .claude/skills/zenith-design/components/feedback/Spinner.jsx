import React from "react";

// Zenith loading states. Spinner: a gold-arc ring for inline/button busy states.
// Skeleton: a shimmering placeholder block for content not yet loaded — size it
// to the real element it stands in for. Both respect prefers-reduced-motion via
// the shared keyframes (which flatten under reduced motion).
export function Spinner({ size = 20, thickness = 2, style = {}, ...rest }) {
  return (
    <span role="status" aria-label="Loading" style={{ display: "inline-block", width: size, height: size, ...style }} {...rest}>
      <span style={{
        display: "block", width: "100%", height: "100%", borderRadius: "50%",
        border: `${thickness}px solid var(--track)`, borderTopColor: "var(--accent)",
        animation: "zn-spin 0.7s linear infinite",
      }} />
    </span>
  );
}

export function Skeleton({ width = "100%", height = 14, radius = "var(--radius-sm)", circle = false, style = {}, ...rest }) {
  const dim = circle ? { width: height, height, borderRadius: "50%" } : { width, height, borderRadius: radius };
  return (
    <span aria-hidden="true" style={{
      display: "block",
      background: "linear-gradient(90deg, var(--surface-sunken) 0%, var(--line) 50%, var(--surface-sunken) 100%)",
      backgroundSize: "200% 100%", animation: "zn-shimmer 1.3s ease-in-out infinite",
      ...dim, ...style,
    }} {...rest} />
  );
}
