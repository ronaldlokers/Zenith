import React from "react";

// Zenith date picker — interview/deadline scheduling. A field that opens a
// month-grid calendar in a Popover-style surface. Controlled: parent owns
// `value` (YYYY-MM-DD string | null) and `onChange`. Today is ringed; the
// selected day is gold. Month nav via chevrons. Local-time, no deps.
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

export function DatePicker({ value = null, onChange = () => {}, placeholder = "Select a date", label, id, style = {}, ...rest }) {
  const selected = parse(value);
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(selected || new Date());
  const root = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const today = new Date(); const todayIso = iso(today);
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(y, m, i + 1))];
  const label2 = selected ? selected.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const navBtn = { appearance: "none", border: "none", background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, padding: 4, borderRadius: "var(--radius-sm)" };
  return (
    <div ref={root} style={{ fontFamily: "var(--sans)", position: "relative", display: "inline-block", ...style }} {...rest}>
      {label && <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>{label}</label>}
      <button id={id} type="button" onClick={() => setOpen((o) => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: "0.5rem", minWidth: 200,
        background: "var(--surface-sunken)", border: "1px solid " + (open ? "var(--accent)" : "var(--border)"),
        borderRadius: "var(--radius-md)", padding: "0.5rem 0.7rem", cursor: "pointer",
        fontFamily: "var(--sans)", fontSize: "var(--text-body)", color: selected ? "var(--ink)" : "var(--faint)",
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        <span style={{ flex: 1, textAlign: "left" }}>{label2 || placeholder}</span>
      </button>
      {open && (
        <div role="dialog" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 950, width: 252, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-2)", padding: "0.7rem", animation: "zn-slide var(--dur-fast, 120ms) var(--ease-emphasized, ease)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button onClick={() => setView(new Date(y, m - 1, 1))} aria-label="Previous month" style={navBtn}>‹</button>
            <span style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--ink)" }}>{MONTHS[m]} {y}</span>
            <button onClick={() => setView(new Date(y, m + 1, 1))} aria-label="Next month" style={navBtn}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {DOW.map((d, i) => <span key={i} style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: "var(--text-chrome)", color: "var(--faint)", padding: "2px 0" }}>{d}</span>)}
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const di = iso(d), isSel = value === di, isToday = todayIso === di;
              return (
                <button key={i} onClick={() => { onChange(di); setOpen(false); }} style={{
                  appearance: "none", border: isToday && !isSel ? "1px solid var(--accent)" : "1px solid transparent",
                  background: isSel ? "var(--accent)" : "none", color: isSel ? "var(--accent-text)" : "var(--ink)",
                  borderRadius: "var(--radius-sm)", height: 30, cursor: "pointer", fontFamily: "var(--sans)", fontSize: "var(--text-meta)", fontWeight: isSel ? 700 : 500,
                  transition: "background var(--dur-fast, 120ms) var(--ease-standard, ease)",
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "var(--hover)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "none"; }}>{d.getDate()}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
