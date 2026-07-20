import React from "react";

// Zenith accordion — collapsible sections (Settings, CV). Hairline-divided rows;
// each header toggles its panel with a rotating chevron. `items`:
// [{ id, title, content }]. `multiple` allows several open at once; otherwise
// single-open. Uncontrolled with `defaultOpen` (id or id[]).
export function Accordion({ items = [], multiple = false, defaultOpen = null, style = {}, ...rest }) {
  const init = defaultOpen == null ? [] : Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen];
  const [open, setOpen] = React.useState(init);
  const toggle = (id) => setOpen((cur) => {
    const has = cur.includes(id);
    if (multiple) return has ? cur.filter((x) => x !== id) : [...cur, id];
    return has ? [] : [id];
  });
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface)", fontFamily: "var(--sans)", ...style }} {...rest}>
      {items.map((it, i) => {
        const isOpen = open.includes(it.id);
        return (
          <div key={it.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
            <button onClick={() => toggle(it.id)} aria-expanded={isOpen} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", width: "100%",
              appearance: "none", border: "none", background: "none", cursor: "pointer", textAlign: "left",
              padding: "0.9rem 1.1rem", fontFamily: "var(--sans)", fontSize: "var(--text-body)", fontWeight: 600, color: "var(--ink)",
            }}>
              {it.title}
              <span aria-hidden="true" style={{ flex: "0 0 auto", color: "var(--faint)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform var(--dur-fast, 120ms) var(--ease-standard, ease)" }}>›</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 1.1rem 1rem", fontSize: "var(--text-body)", color: "var(--muted)", lineHeight: 1.55 }}>{it.content}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
