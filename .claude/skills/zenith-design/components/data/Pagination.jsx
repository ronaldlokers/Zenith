import React from "react";

// Zenith pagination — page controls for long lists. Prev/next chevrons plus a
// windowed set of page numbers with ellipses. Controlled: parent owns `page`
// (1-based) and `onChange`. Active page is gold; others neutral ghost buttons.
function pageWindow(page, total, span = 1) {
  const out = [];
  const push = (v) => out[out.length - 1] !== v && out.push(v);
  push(1);
  for (let p = page - span; p <= page + span; p++) if (p > 1 && p < total) push(p);
  if (total > 1) push(total);
  const withGaps = [];
  out.forEach((p, i) => {
    if (i && p - out[i - 1] > 1) withGaps.push("…");
    withGaps.push(p);
  });
  return withGaps;
}

export function Pagination({ page = 1, total = 1, onChange = () => {}, style = {}, ...rest }) {
  const go = (p) => p >= 1 && p <= total && p !== page && onChange(p);
  const cell = (extra = {}) => ({
    minWidth: 32, height: 32, padding: "0 0.4rem", borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)",
    fontFamily: "var(--sans)", fontSize: "var(--text-meta)", fontWeight: 600, cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "background var(--dur-fast, 120ms) var(--ease-standard, ease)", ...extra,
  });
  return (
    <nav aria-label="Pagination" style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: "var(--sans)", ...style }} {...rest}>
      <button onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page" style={cell({ cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.45 : 1 })}>‹</button>
      {pageWindow(page, total).map((p, i) =>
        p === "…" ? (
          <span key={"g" + i} style={{ color: "var(--faint)", padding: "0 2px" }}>…</span>
        ) : (
          <button key={p} onClick={() => go(p)} aria-current={p === page ? "page" : undefined}
            style={cell(p === page ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--accent-text)" } : {})}>{p}</button>
        )
      )}
      <button onClick={() => go(page + 1)} disabled={page >= total} aria-label="Next page" style={cell({ cursor: page >= total ? "not-allowed" : "pointer", opacity: page >= total ? 0.45 : 1 })}>›</button>
    </nav>
  );
}
