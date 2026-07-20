import React from "react";

// Zenith top bar — the surface header that opens each screen. Serif title,
// optional children in the middle (badges, search), and a right-aligned
// `actions` slot for buttons. Sits above the scrolling content region.
export function TopBar({ title, actions, children, style, ...rest }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", fontFamily: "var(--sans)", ...style }} {...rest}>
      {title && <h1 style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 22, margin: 0, letterSpacing: "-.01em", color: "var(--ink)" }}>{title}</h1>}
      {children}
      {actions != null && <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>{actions}</div>}
    </header>
  );
}
