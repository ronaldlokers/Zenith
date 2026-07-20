import React from "react";

// Zenith empty state — the centered "nothing here yet" panel used across the
// product's list views. Pass one of the Empty*Icon components as `icon`. Keep
// copy to a short title + one supporting line; the action is a single primary
// Button. Muted palette; never stage colors.
export function EmptyState({ icon = null, title, description, action = null, style = {}, ...rest }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center", gap: "0.75rem", padding: "2.5rem 1.5rem", fontFamily: "var(--sans)",
      color: "var(--muted)", maxWidth: 360, margin: "0 auto", ...style,
    }} {...rest}>
      {icon && <div style={{ color: "var(--faint)", marginBottom: "0.25rem", display: "inline-flex" }}>{icon}</div>}
      {title && <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: "var(--text-title)", fontWeight: 600, color: "var(--ink)" }}>{title}</h3>}
      {description && <p style={{ margin: 0, fontSize: "var(--text-body)", lineHeight: 1.55, color: "var(--muted)" }}>{description}</p>}
      {action && <div style={{ marginTop: "0.5rem" }}>{action}</div>}
    </div>
  );
}
