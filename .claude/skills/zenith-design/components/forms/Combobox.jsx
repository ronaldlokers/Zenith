import React from "react";

// Zenith tag input / combobox — skills & company tagging. Chips for selected
// values plus a text field with a filtered suggestion list. Controlled: parent
// owns `value` (string[]) and `onChange`. Free text allowed unless
// `allowCustom={false}`. Enter/comma commits; Backspace on empty removes last.
export function Combobox({ value = [], onChange = () => {}, suggestions = [], placeholder = "Add…", allowCustom = true, label, id, style = {}, ...rest }) {
  const [text, setText] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const root = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const add = (v) => { const t = v.trim(); if (!t || value.includes(t)) { setText(""); return; } onChange([...value, t]); setText(""); };
  const remove = (v) => onChange(value.filter((x) => x !== v));
  const matches = suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(text.toLowerCase()));
  const onKey = (e) => {
    if ((e.key === "Enter" || e.key === ",") && text.trim()) { e.preventDefault(); if (allowCustom || suggestions.includes(text.trim())) add(text); }
    else if (e.key === "Backspace" && !text && value.length) remove(value[value.length - 1]);
  };
  return (
    <div ref={root} style={{ fontFamily: "var(--sans)", position: "relative", ...style }} {...rest}>
      {label && <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>{label}</label>}
      <div onClick={() => setOpen(true)} style={{
        display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "0.4rem 0.5rem",
        background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "text", minHeight: 40,
      }}>
        {value.map((v) => (
          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--accent-soft)", color: "var(--accent-ink)", borderRadius: "var(--radius-full)", padding: "0.15rem 0.5rem", fontSize: "var(--text-meta)", fontWeight: 600 }}>
            {v}
            <button onClick={(e) => { e.stopPropagation(); remove(v); }} aria-label={"Remove " + v} style={{ appearance: "none", border: "none", background: "none", cursor: "pointer", color: "var(--accent-ink)", fontSize: 13, lineHeight: 1, padding: 0 }}>&times;</button>
          </span>
        ))}
        <input id={id} value={text} placeholder={value.length ? "" : placeholder}
          onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          style={{ flex: 1, minWidth: 80, appearance: "none", border: "none", background: "none", outline: "none", fontFamily: "var(--sans)", fontSize: "var(--text-body)", color: "var(--ink)" }} />
      </div>
      {open && matches.length > 0 && (
        <ul style={{ listStyle: "none", margin: "4px 0 0", padding: "0.3rem", position: "absolute", left: 0, right: 0, zIndex: 950, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-2)", maxHeight: 200, overflow: "auto" }}>
          {matches.slice(0, 8).map((s) => (
            <li key={s}>
              <button onClick={() => { add(s); setOpen(false); }} style={{ width: "100%", textAlign: "left", appearance: "none", border: "none", background: "none", cursor: "pointer", padding: "0.4rem 0.5rem", borderRadius: "var(--radius-sm)", fontFamily: "var(--sans)", fontSize: "var(--text-body)", color: "var(--ink)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>{s}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
