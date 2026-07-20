import React from "react";

// Zenith app sidebar — the Night navigation rail used across every product
// surface. Composes NavItem rows; optional brand header, footer, and children
// (e.g. onboarding, user block). Width is fixed at 210px to match the kits.
export function Sidebar({ brand = "Zenith", logoSrc, footer, children, style, ...rest }) {
  return (
    <aside style={{ width: 210, flex: "0 0 210px", background: "var(--night)", color: "#e7e6f0", display: "flex", flexDirection: "column", padding: "20px 0", fontFamily: "var(--sans)", ...style }} {...rest}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 20px 22px" }}>
        {logoSrc && <img src={logoSrc} alt="" style={{ height: 30 }} />}
        <span style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 20, letterSpacing: "-.02em", color: "#f4f2ec" }}>{brand}</span>
      </div>
      {children}
      {footer != null && <div style={{ marginTop: "auto", padding: "14px 20px 0", fontFamily: "var(--mono)", fontSize: 11, color: "#7d7c95", letterSpacing: ".04em" }}>{footer}</div>}
    </aside>
  );
}

// A single navigation row. `active` gives the gold-tinted selected state;
// `icon` is an SVG path string (24×24 viewBox, stroked with currentColor).
export function NavItem({ label, icon, active = false, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const base = { display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", borderRadius: "var(--radius-md)", fontSize: 14, cursor: "pointer", border: "none", background: "none", textAlign: "left", fontFamily: "inherit", width: "calc(100% - 24px)", margin: "0 12px", boxSizing: "border-box" };
  const tone = active
    ? { background: "var(--gold-soft)", color: "var(--accent)" }
    : { color: hover ? "#f4f2ec" : "#b9b8cc", background: hover ? "rgba(255,255,255,.06)" : "none" };
  return (
    <button onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ ...base, ...tone, ...style }} {...rest}>
      {icon && <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, stroke: "currentColor", fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}><path d={icon} /></svg>}
      {label}
    </button>
  );
}
