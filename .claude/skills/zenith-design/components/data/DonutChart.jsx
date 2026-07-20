import React from "react";

// Zenith donut chart — part-to-whole (e.g. applications by source). SVG ring with
// a centered total. Data-viz categorical palette by default; pass per-slice
// `color`. Legend optional. No deps.
const CATS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)"];

export function DonutChart({ data = [], size = 160, thickness = 22, centerLabel, legend = true, style = {}, ...rest }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const segs = data.map((d, i) => {
    const frac = d.value / total;
    const seg = { color: d.color || CATS[i % CATS.length], dash: frac * circ, gap: circ - frac * circ, off: -offset * circ, label: d.label, value: d.value, pct: Math.round(frac * 100) };
    offset += frac;
    return seg;
  });
  return (
    <div style={{ fontFamily: "var(--sans)", display: "flex", alignItems: "center", gap: 20, ...style }} {...rest}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: "0 0 auto" }}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
          {segs.map((s, i) => (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${s.gap}`} strokeDashoffset={s.off} strokeLinecap="butt" />
          ))}
        </g>
        <text x="50%" y="47%" textAnchor="middle" style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: size * 0.2, fill: "var(--ink)" }}>{total}</text>
        {centerLabel && <text x="50%" y="61%" textAnchor="middle" style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", fill: "var(--faint)" }}>{centerLabel}</text>}
      </svg>
      {legend && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {segs.map((s, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-meta)", color: "var(--ink)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: "0 0 auto" }} />
              <span style={{ flex: 1 }}>{s.label}</span>
              <span style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: "var(--text-chrome)" }}>{s.pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
