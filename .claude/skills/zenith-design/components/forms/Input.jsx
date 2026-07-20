import React from "react";

// Zenith form primitives — the labeled inputs the product screens hand-roll.
// All share the hairline-on-sunken field style with a gold focus ring.

function Field({ label, hint, htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "var(--sans)" }}>
      {label && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</span>}
      {children}
      {hint && <span style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</span>}
    </label>
  );
}

const fieldBox = {
  border: "1px solid var(--border)", background: "var(--bg)", borderRadius: "var(--radius-md)",
  padding: "9px 12px", fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box",
};
function useFocusRing() {
  const [f, setF] = React.useState(false);
  return [f, { onFocus: () => setF(true), onBlur: () => setF(false), ring: f ? { borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" } : null }];
}

export function Input({ label, hint, id, style, ...rest }) {
  const [, h] = useFocusRing();
  return <Field label={label} hint={hint} htmlFor={id}><input id={id} onFocus={h.onFocus} onBlur={h.onBlur} style={{ ...fieldBox, ...h.ring, ...style }} {...rest} /></Field>;
}

export function Textarea({ label, hint, id, rows = 4, style, ...rest }) {
  const [, h] = useFocusRing();
  return <Field label={label} hint={hint} htmlFor={id}><textarea id={id} rows={rows} onFocus={h.onFocus} onBlur={h.onBlur} style={{ ...fieldBox, resize: "vertical", lineHeight: 1.5, ...h.ring, ...style }} {...rest} /></Field>;
}

export function Select({ label, hint, id, options = [], children, style, ...rest }) {
  const [, h] = useFocusRing();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} onFocus={h.onFocus} onBlur={h.onBlur} style={{ ...fieldBox, cursor: "pointer", ...h.ring, ...style }} {...rest}>
        {children || options.map((o) => {
          const val = typeof o === "string" ? o : o.value;
          const lbl = typeof o === "string" ? o : o.label;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
    </Field>
  );
}

export function Checkbox({ label, id, style, ...rest }) {
  return (
    <label htmlFor={id} style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)", cursor: "pointer", ...style }}>
      <input id={id} type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }} {...rest} />
      {label}
    </label>
  );
}

// Toggle switch — the Settings on/off control. Gold track when on. Controlled
// (`checked` + `onChange`) or uncontrolled via `defaultChecked`.
export function Switch({ label, hint, checked, defaultChecked, onChange = () => {}, disabled = false, id, style, ...rest }) {
  const isControlled = checked !== undefined;
  const [on, setOn] = React.useState(!!defaultChecked);
  const val = isControlled ? checked : on;
  const toggle = () => { if (disabled) return; if (!isControlled) setOn(v => !v); onChange(!val); };
  return (
    <label htmlFor={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, fontFamily: "var(--sans)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, ...style }}>
      <span style={{ minWidth: 0 }}>
        {label && <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</span>}
        {hint && <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{hint}</span>}
      </span>
      <button
        id={id} type="button" role="switch" aria-checked={val} disabled={disabled} onClick={toggle}
        style={{ flex: "0 0 auto", width: 40, height: 22, borderRadius: "var(--radius-full)", border: "none", padding: 0, cursor: "inherit", background: val ? "var(--accent)" : "var(--track)", position: "relative", transition: "background var(--dur-fast, 120ms) var(--ease-standard, ease)" }}
        {...rest}
      >
        <span style={{ position: "absolute", top: 2, left: val ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: val ? "var(--accent-text)" : "var(--surface)", boxShadow: "var(--shadow-1)", transition: "left var(--dur-fast, 120ms) var(--ease-standard, ease)" }} />
      </button>
    </label>
  );
}

// Radio group — single choice. Vertical by default; pass `row` for inline.
export function RadioGroup({ label, name, value, defaultValue, onChange = () => {}, options = [], row = false, style, ...rest }) {
  const isControlled = value !== undefined;
  const [val, setVal] = React.useState(defaultValue);
  const cur = isControlled ? value : val;
  const pick = (v) => { if (!isControlled) setVal(v); onChange(v); };
  return (
    <div role="radiogroup" aria-label={typeof label === "string" ? label : undefined} style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "var(--sans)", ...style }} {...rest}>
      {label && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</span>}
      <div style={{ display: "flex", flexDirection: row ? "row" : "column", gap: row ? 18 : 8, flexWrap: "wrap" }}>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const lbl = typeof o === "string" ? o : o.label;
          const on = cur === v;
          return (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink)", cursor: "pointer" }}>
              <input type="radio" name={name} checked={on} onChange={() => pick(v)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
              <span style={{ width: 17, height: 17, borderRadius: "50%", flex: "0 0 auto", border: `2px solid ${on ? "var(--accent)" : "var(--border)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "border-color var(--dur-fast, 120ms) var(--ease-standard, ease)" }}>
                {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />}
              </span>
              {lbl}
            </label>
          );
        })}
      </div>
    </div>
  );
}
