import React from "react";

// Zenith button. Plain <button> in the source, styled by App.css; this wraps
// the same visual contract into a variant/size API. Gold is the only accent —
// primary = gold bg + night text (--accent / --accent-text).
const PAD = { sm: "0.35rem 0.6rem", md: "0.5rem 0.75rem", lg: "0.6rem 1rem" };
const FS = { sm: "var(--text-meta)", md: "var(--text-body)", lg: "var(--text-title)" };

export function Button({
  variant = "default",
  size = "md",
  disabled = false,
  type = "button",
  icon = null,
  children,
  style = {},
  ...rest
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.4rem",
    fontFamily: "var(--sans)",
    fontSize: FS[size],
    fontWeight: 500,
    lineHeight: 1,
    padding: PAD[size],
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--ink)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
    whiteSpace: "nowrap",
  };
  const variants = {
    default: {},
    primary: { background: "var(--accent)", color: "var(--accent-text)", borderColor: "transparent", fontWeight: 700 },
    dark: { background: "var(--night)", color: "#f4f2ec", borderColor: "transparent" },
    ghost: { background: "transparent", borderColor: "transparent", color: "var(--muted)" },
    danger: { background: "var(--danger)", color: "var(--danger-text)", borderColor: "transparent" },
  };
  return (
    <button type={type} disabled={disabled} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {icon}
      {children}
    </button>
  );
}
