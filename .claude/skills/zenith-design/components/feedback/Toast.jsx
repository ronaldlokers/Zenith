import React from "react";

// Zenith toast — transient confirmation / alert. Surface card, shadow-2, a
// leading semantic accent bar + icon. Presentational: render one, or stack a few
// bottom-right and drive dismissal from the parent. Semantic colors only (never
// stage colors). Default auto-dismiss via onDismiss + duration.
const KIND = {
  success: { c: "var(--success)", icon: "✓" },
  info: { c: "var(--info)", icon: "ℹ" },
  warning: { c: "var(--warning)", icon: "⚠" },
  danger: { c: "var(--danger)", icon: "×" },
};

export function Toast({ kind = "info", title, message, onDismiss, duration = 0, style = {}, ...rest }) {
  const k = KIND[kind] || KIND.info;
  React.useEffect(() => {
    if (!duration || !onDismiss) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);
  return (
    <div role="status" style={{
      display: "flex", alignItems: "flex-start", gap: "0.7rem",
      background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${k.c}`,
      borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-2)", padding: "0.75rem 0.9rem",
      fontFamily: "var(--sans)", minWidth: 260, maxWidth: 360,
      animation: "zn-slide var(--dur-base, 220ms) var(--ease-emphasized, ease)", ...style,
    }} {...rest}>
      <span style={{ flex: "0 0 auto", width: 20, height: 20, borderRadius: "var(--radius-full)", background: `color-mix(in srgb, ${k.c} 16%, var(--surface))`, color: k.c, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, marginTop: 1 }}>{k.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--ink)" }}>{title}</div>}
        {message && <div style={{ fontSize: "var(--text-meta)", color: "var(--muted)", lineHeight: 1.45, marginTop: title ? 2 : 0 }}>{message}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" style={{ appearance: "none", border: "none", background: "none", cursor: "pointer", color: "var(--faint)", fontSize: 18, lineHeight: 1, padding: 0, flex: "0 0 auto" }}>&times;</button>
      )}
    </div>
  );
}
