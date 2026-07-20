import React from "react";

// Zenith funnel chart — conversion through ordered stages (e.g. applied → offer).
// Centered tapering bars with count + drop-off %. Data-viz sequential palette by
// default; pass per-step `color`. NOT the pipeline StageStepper — this is an
// analytics view of aggregate volume, so it uses viz colors, not --st-*.
const SEQ = ["var(--viz-seq-4)", "var(--viz-seq-3)", "var(--viz-3)", "var(--viz-6)", "var(--viz-2)"];

export function FunnelChart({ data = [], style = {}, ...rest }) {
  const top = Math.max(1, data[0]?.value ?? 1);
  return (
    <div style={{ fontFamily: "var(--sans)", display: "flex", flexDirection: "column", gap: 4, ...style }} {...rest}>
      {data.map((d, i) => {
        const pct = (d.value / top) * 100;
        const prev = i > 0 ? data[i - 1].value : d.value;
        const conv = prev ? Math.round((d.value / prev) * 100) : 100;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 92, flex: "0 0 auto", fontSize: "var(--text-meta)", color: "var(--muted)", textAlign: "right" }}>{d.label}</span>
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ width: `${Math.max(pct, 6)}%`, background: d.color || SEQ[i % SEQ.length], color: "var(--night)", borderRadius: "var(--radius-sm)", padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 700, fontSize: "var(--text-meta)", transition: "width var(--dur-base, 220ms) var(--ease-standard, ease)" }}>
                {d.value}
              </div>
            </div>
            <span style={{ width: 44, flex: "0 0 auto", fontFamily: "var(--mono)", fontSize: "var(--text-chrome)", color: i === 0 ? "var(--faint)" : conv >= 50 ? "var(--success)" : "var(--muted)" }}>{i === 0 ? "" : conv + "%"}</span>
          </div>
        );
      })}
    </div>
  );
}
