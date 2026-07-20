import React from "react";

// Zenith alert / banner — persistent, inline page-level message (distinct from
// the transient Toast). Semantic tint background + accent border, leading icon,
// optional title and dismiss. Semantic colors only — never stage colors.
const KIND = {
  info: { c: "var(--info)", icon: "ℹ" },
  success: { c: "var(--success)", icon: "✓" },
  warning: { c: "var(--warning)", icon: "⚠" },
  danger: { c: "var(--danger)", icon: "✕" },
};

export function Alert({ kind = "info", title, children, onDismiss = null, action = null, style = {}, ...rest }) {
  const k = KIND[kind] || KIND.info;
  return (
    <div role="alert" style={{
      display: "flex", alignItems: "flex-start", gap: "0.7rem",
      background: `color-mix(in srgb, ${k.c} 10%, var(--surface))`,
      border: `1px solid color-mix(in srgb, ${k.c} 35%, var(--border))`,
      borderLeft: `3px solid ${k.c}`, borderRadius: "var(--radius-md)",
      padding: "0.8rem 0.95rem", fontFamily: "var(--sans)", color: "var(--ink)", ...style,
    }} {...rest}>
      <span style={{ flex: "0 0 auto", width: 20, height: 20, borderRadius: "var(--radius-full)", background: k.c, color: "var(--surface)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, marginTop: 1 }}>{k.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: "var(--text-body)", fontWeight: 600, marginBottom: children ? 2 : 0 }}>{title}</div>}
        {children && <div style={{ fontSize: "var(--text-meta)", color: "var(--muted)", lineHeight: 1.5 }}>{children}</div>}
        {action && <div style={{ marginTop: "0.6rem" }}>{action}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" style={{ appearance: "none", border: "none", background: "none", cursor: "pointer", color: "var(--faint)", fontSize: 18, lineHeight: 1, padding: 0, flex: "0 0 auto" }}>&times;</button>
      )}
    </div>
  );
}
