import React from "react";

// Zenith breadcrumb — back-navigation trail (the Detail screen). Items
// {label, href?, onClick?}; the last is the current page (muted, non-interactive).
// Chevron separators; links use the gold link color.
export function Breadcrumb({ items = [], style = {}, ...rest }) {
  return (
    <nav aria-label="Breadcrumb" style={{ fontFamily: "var(--sans)", ...style }} {...rest}>
      <ol style={{ listStyle: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", margin: 0, padding: 0 }}>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              {last ? (
                <span aria-current="page" style={{ fontSize: "var(--text-meta)", color: "var(--muted)", fontWeight: 600 }}>{it.label}</span>
              ) : (
                <a href={it.href || "#"} onClick={it.onClick}
                  style={{ fontSize: "var(--text-meta)", color: "var(--accent-ink)", textDecoration: "none", fontWeight: 500 }}>{it.label}</a>
              )}
              {!last && <span aria-hidden="true" style={{ color: "var(--faint)", fontSize: "var(--text-meta)" }}>›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
