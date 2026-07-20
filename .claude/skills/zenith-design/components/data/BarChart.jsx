import React from "react";

// Zenith bar/trend chart — lightweight SVG, no deps. Vertical bars for counts or
// a weekly trend. Uses the data-viz palette (never stage colors). Pass a single
// `color` token for one series, or per-datum `color`. Values scale to the max.
export function BarChart({ data = [], height = 160, color = "var(--viz-1)", showValues = true, style = {}, ...rest }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ fontFamily: "var(--sans)", ...style }} {...rest}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height, padding: "0 2px", borderBottom: "1px solid var(--viz-grid)" }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 6 }}>
            {showValues && <span style={{ fontFamily: "var(--mono)", fontSize: "var(--text-chrome)", color: "var(--muted)" }}>{d.value}</span>}
            <div title={`${d.label}: ${d.value}`} style={{ width: "100%", maxWidth: 46, height: `${(d.value / max) * 100}%`, minHeight: 2, background: d.color || color, borderRadius: "var(--radius-sm) var(--radius-sm) 0 0", transition: "height var(--dur-base, 220ms) var(--ease-standard, ease)" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {data.map((d, i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", fontSize: "var(--text-chrome)", color: "var(--faint)", textTransform: "uppercase", letterSpacing: "var(--track-chrome)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}
