import React from "react";

// Zenith mobile splash / loading screen. Full-viewport Night field with the
// ascent-path logo, wordmark, and a rising three-rung loader that echoes the
// pipeline climb. Use on app cold-start and auth hand-off.
export function SplashScreen({
  brand = "Zenith",
  tagline = "Reach your zenith.",
  status = "loading",
  logoSrc,
  style,
  ...rest
}) {
  const wrap = {
    position: "absolute", inset: 0, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: "var(--space-5, 20px)",
    background: "radial-gradient(120% 80% at 50% 0%, #1b1f4d 0%, var(--night, #14173a) 60%)",
    color: "#f4f2ec", fontFamily: "var(--sans)", textAlign: "center", padding: "24px",
    ...style,
  };
  const rungs = ["var(--st-interested)", "var(--st-screening)", "var(--accent, #d6a441)"];
  return (
    <div role="status" aria-live="polite" aria-busy={status === "loading"} style={wrap} {...rest}>
      <style>{`@keyframes zen-climb{0%,100%{transform:scaleX(.55);opacity:.5}50%{transform:scaleX(1);opacity:1}}@keyframes zen-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <div style={{ animation: "zen-in .5s ease both", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
        {logoSrc
          ? <img src={logoSrc} alt="" width="72" height="72" style={{ display: "block" }} />
          : <span aria-hidden="true" style={{ width: 72, height: 72, borderRadius: "var(--radius-lg, 14px)", background: "rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--serif)", fontWeight: 600, fontSize: 34, color: "var(--accent, #d6a441)" }}>{brand.charAt(0)}</span>}
        <div style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "32px", letterSpacing: "-.02em", lineHeight: 1 }}>{brand}</div>
        {tagline && <div style={{ fontSize: "14px", color: "#b9b8cc" }}>{tagline}</div>}
      </div>
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", marginTop: "8px" }}>
        {rungs.map((c, i) => (
          <span key={i} style={{ display: "block", width: 46 - i * 6, height: 4, borderRadius: "var(--radius-full, 999px)", background: c, transformOrigin: "center", animation: `zen-climb 1.3s ${i * 0.18}s ease-in-out infinite` }} />
        )).reverse()}
      </div>
    </div>
  );
}
