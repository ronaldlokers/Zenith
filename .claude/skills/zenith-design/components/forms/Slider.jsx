import React from "react";

// Zenith slider — single-value range with a gold fill and thumb. Controlled
// (`value`+`onChange`) or uncontrolled (`defaultValue`). Optional label + live
// value readout. Built on a native <input type=range> for full a11y/keyboard.
export function Slider({ label, value, defaultValue = 50, onChange = () => {}, min = 0, max = 100, step = 1, format = (v) => v, id, style = {}, ...rest }) {
  const isControlled = value !== undefined;
  const [val, setVal] = React.useState(defaultValue);
  const cur = isControlled ? value : val;
  const pct = ((cur - min) / (max - min)) * 100;
  const handle = (e) => { const v = Number(e.target.value); if (!isControlled) setVal(v); onChange(v); };
  return (
    <div style={{ fontFamily: "var(--sans)", ...style }}>
      {(label || label === "") && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</label>
          <span style={{ fontFamily: "var(--mono)", fontSize: "var(--text-meta)", color: "var(--muted)" }}>{format(cur)}</span>
        </div>
      )}
      <input
        id={id} type="range" value={cur} min={min} max={max} step={step} onChange={handle}
        style={{
          width: "100%", height: 6, borderRadius: "var(--radius-full)", appearance: "none", cursor: "pointer",
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--track) ${pct}%, var(--track) 100%)`,
        }}
        {...rest}
      />
    </div>
  );
}
