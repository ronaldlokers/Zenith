import React from "react";

// Zenith context menu — right-click actions on pipeline cards. Wraps any child;
// right-click opens a menu at the cursor. Same visual language as DropdownMenu
// (surface, shadow-2, danger rows). `items`: {label, icon?, onClick?, tone?,
// disabled?} or {divider:true}. Closes on outside-click, Escape, or selection.
export function ContextMenu({ items = [], children, style = {}, ...rest }) {
  const [menu, setMenu] = React.useState(null); // {x, y}
  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); window.removeEventListener("keydown", onKey); };
  }, [menu]);
  const onContext = (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); };
  return (
    <div onContextMenu={onContext} style={{ display: "contents", ...style }} {...rest}>
      {children}
      {menu && (
        <div role="menu" onClick={(e) => e.stopPropagation()} style={{
          position: "fixed", top: menu.y, left: menu.x, zIndex: 1000, minWidth: 190,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-2)", padding: "0.35rem", fontFamily: "var(--sans)",
          animation: "zn-slide var(--dur-fast, 120ms) var(--ease-emphasized, ease)",
        }}>
          {items.map((it, i) =>
            it.divider ? (
              <div key={"d" + i} style={{ height: 1, background: "var(--line)", margin: "0.3rem 0" }} />
            ) : (
              <button key={i} role="menuitem" disabled={it.disabled}
                onClick={() => { if (it.disabled) return; it.onClick && it.onClick(); setMenu(null); }}
                style={{
                  appearance: "none", border: "none", background: "none", textAlign: "left", cursor: it.disabled ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: "0.6rem", width: "100%", padding: "0.45rem 0.55rem", borderRadius: "var(--radius-sm)",
                  fontFamily: "var(--sans)", fontSize: "var(--text-body)", color: it.tone === "danger" ? "var(--danger)" : "var(--ink)", opacity: it.disabled ? 0.5 : 1,
                }}
                onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = it.tone === "danger" ? "color-mix(in srgb, var(--danger) 12%, var(--surface))" : "var(--hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                {it.icon && <span style={{ display: "inline-flex", color: it.tone === "danger" ? "var(--danger)" : "var(--muted)" }}>{it.icon}</span>}
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
