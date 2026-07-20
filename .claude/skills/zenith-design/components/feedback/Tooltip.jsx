import React from "react";

// Zenith tooltip — hover/focus label on a trigger. Night surface bubble with a
// small caret; appears after a short delay. Wrap any focusable element.
// Presentational + self-contained (own hover/focus state). Keep copy to a few
// words — for anything longer use a Popover.
const POS = {
  top: { bubble: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }, caret: { top: "100%", left: "50%", marginLeft: -4, borderWidth: "4px 4px 0 4px", borderColor: "var(--night-raised) transparent transparent transparent" } },
  bottom: { bubble: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }, caret: { bottom: "100%", left: "50%", marginLeft: -4, borderWidth: "0 4px 4px 4px", borderColor: "transparent transparent var(--night-raised) transparent" } },
};

export function Tooltip({ label, position = "top", delay = 250, children, style = {}, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef(null);
  const show = () => { timer.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const p = POS[position] || POS.top;
  return (
    <span
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      style={{ position: "relative", display: "inline-flex", ...style }} {...rest}
    >
      {children}
      {open && (
        <span role="tooltip" style={{
          position: "absolute", zIndex: 900, whiteSpace: "nowrap", pointerEvents: "none",
          background: "var(--night-raised)", color: "#f4f2ec", fontFamily: "var(--sans)",
          fontSize: "var(--text-meta)", fontWeight: 500, lineHeight: 1.3, padding: "0.35rem 0.55rem",
          borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-2)",
          animation: "zn-fade var(--dur-fast, 120ms) var(--ease-standard, ease)", ...p.bubble,
        }}>
          {label}
          <span style={{ position: "absolute", width: 0, height: 0, border: "solid transparent", ...p.caret }} />
        </span>
      )}
    </span>
  );
}
