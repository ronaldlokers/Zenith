import React from "react";

// Zenith file dropzone — CV import & avatar upload. Dashed sunken well that
// turns gold on drag-over; click opens the native picker. Presentational:
// reports chosen files via onFiles(FileList → File[]). `accept`/`multiple`
// forward to the input. Show selected names via the `files` prop if desired.
export function FileUpload({ onFiles = () => {}, accept, multiple = false, hint = "PDF, DOCX up to 5 MB", label = "Drop a file or click to browse", files = [], style = {}, ...rest }) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef(null);
  const handle = (list) => { if (list && list.length) onFiles(Array.from(list)); };
  return (
    <div style={{ fontFamily: "var(--sans)", ...style }} {...rest}>
      <button type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
        style={{
          width: "100%", appearance: "none", cursor: "pointer", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
          padding: "1.6rem 1.2rem", borderRadius: "var(--radius-lg)",
          border: `1.5px dashed ${over ? "var(--accent)" : "var(--border)"}`,
          background: over ? "var(--accent-soft)" : "var(--surface-sunken)",
          transition: "border-color var(--dur-fast, 120ms) var(--ease-standard, ease), background var(--dur-fast, 120ms) var(--ease-standard, ease)",
        }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={over ? "var(--accent-ink)" : "var(--faint)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" /></svg>
        <span style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--ink)" }}>{label}</span>
        {hint && <span style={{ fontSize: "var(--text-meta)", color: "var(--faint)" }}>{hint}</span>}
      </button>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={(e) => handle(e.target.files)} style={{ display: "none" }} />
      {files.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0.7rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "var(--text-meta)", color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.4rem 0.6rem" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v5h5" /><path d="M6 3h8l5 5v13H6z" /></svg>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{typeof f === "string" ? f : f.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
