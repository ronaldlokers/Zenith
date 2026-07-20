import React from "react";

// Pipeline-stage pill. Stage colors are accessibility-locked (WCAG AA +
// deuteranopia-safe) and reserved EXCLUSIVELY for pipeline state — this is
// the only component that paints with them. Text token per stage; a soft
// tint of the same hue backs the pill.
const STAGE = {
  interested: { c: "var(--st-interested)", label: "Interested" },
  applied: { c: "var(--st-applied)", label: "Applied" },
  screening: { c: "var(--st-screening)", label: "Screening" },
  interview: { c: "var(--st-interview)", label: "Interview" },
  offer: { c: "var(--st-offer)", label: "Offer" },
  rejected: { c: "var(--st-dead)", label: "Rejected" },
  withdrawn: { c: "var(--st-dead)", label: "Withdrawn" },
  ghosted: { c: "var(--st-dead)", label: "Ghosted" },
};

export function StatusBadge({ status = "interested", dot = true, children, style = {}, ...rest }) {
  const s = STAGE[status] || STAGE.interested;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        fontFamily: "var(--sans)",
        fontSize: "var(--text-chrome)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "var(--track-chrome)",
        padding: "0.15rem 0.5rem",
        borderRadius: "var(--radius-full)",
        background: `color-mix(in srgb, ${s.c} 14%, var(--surface))`,
        color: s.c,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.c, flex: "0 0 auto" }} />
      )}
      {children || s.label}
    </span>
  );
}
