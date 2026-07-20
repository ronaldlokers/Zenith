import React from "react";

// Zenith command palette — the ⌘K overlay extracted from AppChrome. Scrim +
// centered surface with a search input and grouped, filterable results.
// Keyboard: ↑/↓ move, Enter runs, Escape closes. Controlled by `open`.
// `groups`: [{ label, items: [{ id, label, hint?, icon?, onRun? }] }].
export function CommandPalette({ open = false, groups = [], onClose = () => {}, placeholder = "Search or jump to…", emptyText = "No matches", ...rest }) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef(null);
  React.useEffect(() => { if (open) { setQuery(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, items: g.items.filter((it) => !q || it.label.toLowerCase().includes(q) || (it.hint || "").toLowerCase().includes(q)) }))
      .filter((g) => g.items.length);
  }, [groups, query]);
  const flat = filtered.flatMap((g) => g.items);

  const run = (it) => { it?.onRun && it.onRun(); onClose(); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(flat[active]); }
    else if (e.key === "Escape") onClose();
  };
  if (!open) return null;
  let idx = -1;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", justifyContent: "center", paddingTop: 90, zIndex: 1000, animation: "zn-fade var(--dur-base, 220ms) var(--ease-standard, ease)" }} {...rest}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette" style={{ width: 520, maxWidth: "90%", height: "fit-content", maxHeight: "70vh", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-2)", overflow: "hidden", fontFamily: "var(--sans)" }}>
        <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder={placeholder}
          style={{ width: "100%", border: "none", borderBottom: "1px solid var(--border)", padding: "16px 18px", fontFamily: "var(--sans)", fontSize: 15, color: "var(--ink)", background: "var(--surface)", outline: "none", boxSizing: "border-box" }} />
        <div role="listbox" style={{ overflowY: "auto", padding: 6 }}>
          {flat.length === 0 && <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--faint)", fontSize: "var(--text-body)" }}>{emptyText}</div>}
          {filtered.map((sec) => (
            <div key={sec.label}>
              <span style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--faint)", padding: "10px 12px 4px" }}>{sec.label}</span>
              {sec.items.map((it) => {
                idx++; const a = idx === active;
                return (
                  <button key={it.id || it.label} role="option" aria-selected={a} onMouseEnter={() => setActive(flat.findIndex((f) => (f.id || f.label) === (it.id || it.label)))} onClick={() => run(it)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: a ? "var(--accent-soft)" : "none", color: a ? "var(--accent-ink)" : "var(--ink)", fontFamily: "var(--sans)", fontSize: 14, padding: "9px 12px", borderRadius: "var(--radius-md)", cursor: "pointer" }}>
                    {it.icon && <span style={{ display: "inline-flex", color: a ? "var(--accent-ink)" : "var(--muted)" }}>{it.icon}</span>}
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.hint && <span style={{ color: a ? "var(--accent-ink)" : "var(--muted)", fontSize: 12 }}>{it.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
