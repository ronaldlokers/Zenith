import React from "react";

// Zenith avatar. Initials on a deterministic tint by default; pass `src` for a
// photo. Neutral by design — NOT painted with stage colors. Ring optional.
const SZ = { sm: 24, md: 34, lg: 44, xl: 64 };
const TINTS = ["var(--night-raised)", "var(--info)", "var(--ev-touch)", "var(--success)", "var(--accent-ink)"];
function hashIdx(str, n) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h % n; }
function initials(name = "") { return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"; }

export function Avatar({ name = "", src = null, size = "md", ring = false, style = {}, ...rest }) {
  const px = SZ[size] || SZ.md;
  const base = {
    width: px, height: px, borderRadius: "var(--radius-full)", flex: "0 0 auto",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontFamily: "var(--sans)", fontWeight: 600, fontSize: Math.round(px * 0.4),
    color: "#f4f2ec", background: TINTS[hashIdx(name || "?", TINTS.length)],
    overflow: "hidden", userSelect: "none",
    boxShadow: ring ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent)" : "none",
    ...style,
  };
  return (
    <span style={base} title={name} {...rest}>
      {src ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(name)}
    </span>
  );
}

export function AvatarGroup({ people = [], size = "md", max = 4, style = {}, ...rest }) {
  const px = SZ[size] || SZ.md;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", ...style }} {...rest}>
      {shown.map((p, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -px * 0.32, boxShadow: "0 0 0 2px var(--surface)", borderRadius: "var(--radius-full)" }}>
          <Avatar name={typeof p === "string" ? p : p.name} src={typeof p === "object" ? p.src : null} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span style={{ marginLeft: -px * 0.32, width: px, height: px, borderRadius: "var(--radius-full)", boxShadow: "0 0 0 2px var(--surface)", background: "var(--surface-sunken)", color: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--sans)", fontWeight: 600, fontSize: Math.round(px * 0.34) }}>+{extra}</span>
      )}
    </span>
  );
}
