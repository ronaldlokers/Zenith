import React from "react";

// Zenith popover — anchored floating surface for filter panels and custom menus.
// Self-managed open state via a trigger element; closes on outside-click and
// Escape. Surface card, shadow-2. For a simple action list, prefer DropdownMenu
// (below) which builds on the same shell.
const ALIGN = { start: { left: 0 }, end: { right: 0 } };

export function Popover({ trigger, children, align = "start", width, style = {}, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span ref={root} style={{ position: "relative", display: "inline-flex" }} {...rest}>
      <span onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex" }}>
        {typeof trigger === "function" ? trigger(open) : trigger}
      </span>
      {open && (
        <div role="dialog" style={{
          position: "absolute", top: "calc(100% + 6px)", zIndex: 950, width,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-2)", padding: "0.4rem", fontFamily: "var(--sans)", color: "var(--ink)",
          animation: "zn-slide var(--dur-fast, 120ms) var(--ease-emphasized, ease)", ...(ALIGN[align] || ALIGN.start), ...style,
        }}>
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </span>
  );
}

// Action menu — a Popover preset. `items`: {label, icon?, onClick?, tone?,
// disabled?} or {divider:true}. `tone: "danger"` for destructive rows.
export function DropdownMenu({ trigger, items = [], align = "end", width = 200, ...rest }) {
  return (
    <Popover trigger={trigger} align={align} width={width} style={{ padding: "0.35rem" }} {...rest}>
      {(close) => (
        <div role="menu" style={{ display: "flex", flexDirection: "column" }}>
          {items.map((it, i) =>
            it.divider ? (
              <div key={"d" + i} style={{ height: 1, background: "var(--line)", margin: "0.3rem 0" }} />
            ) : (
              <button key={i} role="menuitem" disabled={it.disabled}
                onClick={() => { if (it.disabled) return; it.onClick && it.onClick(); close(); }}
                style={{
                  appearance: "none", border: "none", background: "none", textAlign: "left", cursor: it.disabled ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.45rem 0.55rem", borderRadius: "var(--radius-sm)",
                  fontFamily: "var(--sans)", fontSize: "var(--text-body)", color: it.tone === "danger" ? "var(--danger)" : "var(--ink)",
                  opacity: it.disabled ? 0.5 : 1, transition: "background var(--dur-fast, 120ms) var(--ease-standard, ease)",
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
    </Popover>
  );
}
