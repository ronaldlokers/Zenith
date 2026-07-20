import React from "react";

// Zenith progress bar — plain determinate progress (profile completion, upload,
// goal). Neutral track + gold fill by default; pass `tone` for a semantic fill.
// This is NOT the pipeline stepper — use StageStepper for pipeline state.
const TONE = { accent: "var(--accent)", success: "var(--success)", info: "var(--info)", warning: "var(--warning)", danger: "var(--danger)" };

export function ProgressBar({ value = 0, max = 100, tone = "accent", label = null, showValue = false, size = 8, style = {}, ...rest }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = TONE[tone] || TONE.accent;
  return (
    <div style={{ fontFamily: "var(--sans)", ...style }} {...rest}>
      {(label || showValue) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          {label && <span style={{ fontSize: "var(--text-meta)", fontWeight: 600, color: "var(--ink)" }}>{label}</span>}
          {showValue && <span style={{ fontFamily: "var(--mono)", fontSize: "var(--text-chrome)", color: "var(--muted)" }}>{Math.round(pct)}%</span>}
        </div>
      )}
      <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
        style={{ height: size, borderRadius: "var(--radius-full)", background: "var(--track)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: fill, borderRadius: "var(--radius-full)", transition: "width var(--dur-base, 220ms) var(--ease-standard, ease)" }} />
      </div>
    </div>
  );
}
