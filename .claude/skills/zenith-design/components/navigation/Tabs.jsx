import React from "react";

// Zenith tabs — the screen-level section switcher (Overview / Sharing / …).
// Presentational + controlled: parent owns `active`. Gold underline marks the
// active tab; count pills are neutral. Keyboard: arrow keys move focus.
export function Tabs({ items = [], active, onChange = () => {}, style = {}, ...rest }) {
  const keyOf = (t) => (typeof t === "string" ? t : t.key);
  const refs = React.useRef([]);
  function onKey(e, i) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = items.length;
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    refs.current[next]?.focus();
    onChange(keyOf(items[next]));
  }
  return (
    <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", fontFamily: "var(--sans)", ...style }} {...rest}>
      {items.map((t, i) => {
        const key = keyOf(t);
        const label = typeof t === "string" ? t : t.label;
        const count = typeof t === "object" ? t.count : undefined;
        const on = key === active;
        return (
          <button
            key={key} role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
            ref={(el) => (refs.current[i] = el)}
            onClick={() => onChange(key)} onKeyDown={(e) => onKey(e, i)}
            style={{
              appearance: "none", background: "none", border: "none", cursor: "pointer",
              padding: "0.6rem 0.75rem", marginBottom: -1, display: "inline-flex", alignItems: "center", gap: "0.4rem",
              fontFamily: "var(--sans)", fontSize: "var(--text-body)", fontWeight: on ? 700 : 500,
              color: on ? "var(--ink)" : "var(--muted)",
              borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
              transition: "color var(--dur-fast, 120ms) var(--ease-standard, ease)",
            }}
          >
            {label}
            {count != null && (
              <span style={{ fontSize: "var(--text-chrome)", fontWeight: 600, background: on ? "var(--accent-soft)" : "var(--surface-sunken)", color: on ? "var(--accent-ink)" : "var(--faint)", borderRadius: "var(--radius-full)", padding: "0.05rem 0.4rem", lineHeight: 1.5 }}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
