import React from "react";

// Zenith data table — the pipeline/list view. Hairline rows on surface, sticky
// uppercase-mono header, gold sort caret on the active column. Presentational +
// controlled sort: parent owns `sort` ({key, dir}) and `onSort`. Define columns
// as {key, header, width?, align?, sortable?, render?(row)}.
export function Table({ columns = [], rows = [], sort = null, onSort = null, rowKey = (_, i) => i, onRowClick = null, style = {}, ...rest }) {
  const clickSort = (col) => {
    if (!onSort || !col.sortable) return;
    const dir = sort && sort.key === col.key && sort.dir === "asc" ? "desc" : "asc";
    onSort({ key: col.key, dir });
  };
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface)", ...style }} {...rest}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--sans)", fontSize: "var(--text-body)" }}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort && sort.key === c.key;
              return (
                <th key={c.key} onClick={() => clickSort(c)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : c.sortable && onSort ? "none" : undefined} style={{
                  textAlign: c.align || "left", width: c.width, padding: "0.6rem 0.85rem",
                  background: "var(--surface-sunken)", borderBottom: "1px solid var(--border)",
                  fontFamily: "var(--mono)", fontSize: "var(--text-chrome)", textTransform: "uppercase",
                  letterSpacing: "var(--track-chrome)", fontWeight: 600, color: "var(--faint)",
                  cursor: c.sortable && onSort ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap",
                }}>
                  {c.header}
                  {c.sortable && onSort && (
                    <span style={{ marginLeft: 5, color: active ? "var(--accent-ink)" : "var(--faint)", opacity: active ? 1 : 0.4 }}>
                      {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default", transition: "background var(--dur-fast, 120ms) var(--ease-standard, ease)" }}
              onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = "var(--hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || "left", padding: "0.7rem 0.85rem", borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--line)", color: "var(--ink)", verticalAlign: "middle" }}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
