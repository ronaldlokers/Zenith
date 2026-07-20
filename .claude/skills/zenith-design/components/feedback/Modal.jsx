import React from "react";

// Zenith modal / dialog. Scrim + centered surface card. Closes on scrim click,
// Escape, and the × button. `footer` slot for actions (put the primary Button
// last, right-aligned). Renders nothing when `open` is false.
export function Modal({ open = false, title, onClose = () => {}, footer = null, width = 460, children, ...rest }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", zIndex: 1000, animation: "zn-fade var(--dur-base, 220ms) var(--ease-standard, ease)" }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-2)", width, maxWidth: "100%", maxHeight: "100%", overflow: "auto", fontFamily: "var(--sans)", color: "var(--ink)" }}
        {...rest}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", padding: "1.1rem 1.25rem 0.75rem" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: "var(--text-title)", fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ appearance: "none", border: "none", background: "none", cursor: "pointer", color: "var(--faint)", fontSize: 22, lineHeight: 1, padding: 2 }}>&times;</button>
        </div>
        <div style={{ padding: "0 1.25rem 1.1rem", fontSize: "var(--text-body)", color: "var(--muted)", lineHeight: 1.55 }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", padding: "0.9rem 1.25rem", borderTop: "1px solid var(--line)" }}>{footer}</div>}
      </div>
    </div>
  );
}
