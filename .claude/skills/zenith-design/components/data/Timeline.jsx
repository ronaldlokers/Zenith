import React from "react";

// Zenith timeline — the vertical activity/event thread on the Detail screen. A
// rail with nodes; each item {title, time, description?, tone?, icon?}. `tone`
// picks a semantic dot color (default neutral); events are NOT pipeline stages,
// so this uses semantic/neutral hues, never --st-*.
const TONE = { default: "var(--faint)", accent: "var(--accent)", success: "var(--success)", info: "var(--info)", warning: "var(--warning)", danger: "var(--danger)" };

export function Timeline({ items = [], style = {}, ...rest }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, fontFamily: "var(--sans)", ...style }} {...rest}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const dot = TONE[it.tone] || TONE.default;
        return (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 0.85rem" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: dot, boxShadow: "0 0 0 3px color-mix(in srgb, " + dot + " 18%, var(--surface))", marginTop: 3, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--surface)", fontSize: 8 }}>
                {it.icon || null}
              </span>
              {!last && <span style={{ flex: 1, width: 2, background: "var(--line)", minHeight: 16, marginTop: 2 }} />}
            </div>
            <div style={{ paddingBottom: last ? 0 : "1.1rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.75rem" }}>
                <span style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--ink)" }}>{it.title}</span>
                {it.time && <span style={{ fontFamily: "var(--mono)", fontSize: "var(--text-chrome)", color: "var(--faint)", whiteSpace: "nowrap" }}>{it.time}</span>}
              </div>
              {it.description && <p style={{ margin: "2px 0 0", fontSize: "var(--text-meta)", color: "var(--muted)", lineHeight: 1.5 }}>{it.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
