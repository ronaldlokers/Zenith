import React from "react";

// Small pill label. Uppercase chrome type, full radius. `warn` uses the
// gone-quiet heat family; `stage` is a neutral outline pill (for stage color
// use StatusBadge instead, which is accessibility-locked per pipeline state).
export function Badge({ variant = "default", children, style = {}, ...rest }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    fontFamily: "var(--sans)",
    fontSize: "var(--text-chrome)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "var(--track-chrome)",
    padding: "0.15rem 0.5rem",
    borderRadius: "var(--radius-full)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--muted)",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
  };
  const variants = {
    default: {},
    accent: { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "transparent" },
    warn: { background: "color-mix(in srgb, var(--heat-quiet) 14%, var(--surface))", color: "var(--heat-quiet-text)", borderColor: "transparent" },
  };
  return (
    <span style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </span>
  );
}
