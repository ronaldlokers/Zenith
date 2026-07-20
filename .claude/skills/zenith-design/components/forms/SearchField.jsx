import React from "react";

// Zenith search field — the toolbar search pattern. Leading magnifier, rounded
// sunken pill, gold focus ring, and a clear (×) button once there's a value.
// Controlled (`value`+`onChange`) or uncontrolled. `onSubmit` fires on Enter.
export function SearchField({ value, defaultValue = "", onChange = () => {}, onSubmit = null, placeholder = "Search…", width = 260, style = {}, ...rest }) {
  const isControlled = value !== undefined;
  const [val, setVal] = React.useState(defaultValue);
  const [focus, setFocus] = React.useState(false);
  const cur = isControlled ? value : val;
  const set = (v) => { if (!isControlled) setVal(v); onChange(v); };
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "0.5rem", width,
      background: "var(--surface-sunken)", border: "1px solid " + (focus ? "var(--accent)" : "var(--border)"),
      borderRadius: "var(--radius-full)", padding: "0.4rem 0.7rem", fontFamily: "var(--sans)",
      boxShadow: focus ? "0 0 0 3px var(--accent-soft)" : "none",
      transition: "border-color var(--dur-fast, 120ms) var(--ease-standard, ease), box-shadow var(--dur-fast, 120ms) var(--ease-standard, ease)", ...style,
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 auto" }}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input
        type="search" value={cur} placeholder={placeholder}
        onChange={(e) => set(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onKeyDown={(e) => { if (e.key === "Enter" && onSubmit) onSubmit(cur); }}
        style={{ flex: 1, minWidth: 0, appearance: "none", border: "none", background: "none", outline: "none", fontFamily: "var(--sans)", fontSize: "var(--text-body)", color: "var(--ink)" }}
        {...rest}
      />
      {cur && (
        <button onClick={() => set("")} aria-label="Clear search" style={{ appearance: "none", border: "none", background: "none", cursor: "pointer", color: "var(--faint)", fontSize: 16, lineHeight: 1, padding: 0, flex: "0 0 auto" }}>&times;</button>
      )}
    </div>
  );
}
