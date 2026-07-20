import React from "react";

// Zenith metric tile — the dashboard KPI. Neutral surface card; the delta is the
// only colored element (success up / danger down / muted flat). Gold accent only
// when `accent` is set (use sparingly for the single hero metric).
export function StatCard({ label, value, delta = null, trend = "flat", icon = null, accent = false, style = {}, ...rest }) {
  const trendColor = trend === "up" ? "var(--success)" : trend === "down" ? "var(--danger)" : "var(--muted)";
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-1)",
      padding: "1rem 1.1rem", fontFamily: "var(--sans)", minWidth: 150,
      display: "flex", flexDirection: "column", gap: "0.5rem", ...style,
    }} {...rest}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--text-chrome)", textTransform: "uppercase", letterSpacing: "var(--track-chrome)", color: "var(--faint)", fontWeight: 600 }}>{label}</span>
        {icon && <span style={{ color: accent ? "var(--accent-ink)" : "var(--muted)", display: "inline-flex" }}>{icon}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
        <span style={{ fontSize: "1.9rem", fontWeight: 700, lineHeight: 1, color: accent ? "var(--accent-ink)" : "var(--ink)", fontFamily: "var(--serif)" }}>{value}</span>
        {delta != null && (
          <span style={{ fontSize: "var(--text-meta)", fontWeight: 600, color: trendColor, display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span aria-hidden="true">{arrow}</span>{delta}
          </span>
        )}
      </div>
    </div>
  );
}
