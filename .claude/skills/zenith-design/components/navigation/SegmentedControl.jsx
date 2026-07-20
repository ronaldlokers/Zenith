import React from "react";

// Zenith segmented control — compact 2–4 option view switch (Board / List /
// Calendar). Sunken track with a gold-text active segment on a raised surface
// chip. Controlled: parent owns `value` and `onChange`.
export function SegmentedControl({ options = [], value, onChange = () => {}, size = "md", style = {}, ...rest }) {
  const pad = size === "sm" ? "0.3rem 0.7rem" : "0.45rem 0.95rem";
  const fs = size === "sm" ? "var(--text-meta)" : "var(--text-body)";
  return (
    <div role="tablist" style={{
      display: "inline-flex", gap: 2, padding: 3, background: "var(--surface-sunken)",
      border: "1px solid var(--border)", borderRadius: "var(--radius-md)", fontFamily: "var(--sans)", ...style,
    }} {...rest}>
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        const icon = typeof o === "object" ? o.icon : null;
        const on = val === value;
        return (
          <button key={val} role="tab" aria-selected={on} onClick={() => onChange(val)} style={{
            appearance: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: pad, borderRadius: "var(--radius-sm)", fontFamily: "var(--sans)", fontSize: fs, fontWeight: 600,
            background: on ? "var(--surface)" : "transparent", color: on ? "var(--accent-ink)" : "var(--muted)",
            boxShadow: on ? "var(--shadow-1)" : "none",
            transition: "background var(--dur-fast, 120ms) var(--ease-standard, ease), color var(--dur-fast, 120ms) var(--ease-standard, ease)",
          }}>
            {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
            {label}
          </button>
        );
      })}
    </div>
  );
}
