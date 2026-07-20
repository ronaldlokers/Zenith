import React from "react";

// The Ascent — pipeline stage progress. THE canonical use of stage colors as a
// journey: completed + current stages fill with their locked stage hue, upcoming
// stages are muted track. Deuteranopia-safe (hue + lightness + label), reserved
// for pipeline state only.
const STAGES = [
  { key: "interested", c: "var(--st-interested)", label: "Interested" },
  { key: "applied", c: "var(--st-applied)", label: "Applied" },
  { key: "screening", c: "var(--st-screening)", label: "Screening" },
  { key: "interview", c: "var(--st-interview)", label: "Interview" },
  { key: "offer", c: "var(--st-offer)", label: "Offer" },
];

export function StageStepper({ current = "applied", dead = false, style = {}, ...rest }) {
  const idx = Math.max(0, STAGES.findIndex(s => s.key === current));
  return (
    <div style={{ fontFamily: "var(--sans)", ...style }} {...rest}>
      <div style={{ display: "flex", gap: 4 }}>
        {STAGES.map((s, i) => {
          const done = i <= idx && !dead;
          return (
            <div key={s.key} style={{ flex: 1, height: 6, borderRadius: "var(--radius-full)", background: done ? s.c : "var(--track)", transition: "background var(--dur-base, 220ms) var(--ease-standard, ease)" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
        {STAGES.map((s, i) => {
          const active = i === idx && !dead;
          return (
            <span key={s.key} style={{ flex: 1, textAlign: "center", fontSize: "var(--text-chrome)", textTransform: "uppercase", letterSpacing: "var(--track-chrome)", fontWeight: active ? 700 : 500, color: active ? s.c : i < idx && !dead ? "var(--muted)" : "var(--faint)" }}>{s.label}</span>
          );
        })}
      </div>
      {dead && <p style={{ margin: "8px 0 0", fontSize: "var(--text-meta)", color: "var(--st-dead)", fontWeight: 600 }}>Grounded — no longer active</p>}
    </div>
  );
}
