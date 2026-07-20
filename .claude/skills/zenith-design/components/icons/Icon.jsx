import React from "react";

// Zenith icon set — line-art, 24x24 viewBox, currentColor stroke, strokeWidth
// 2, rounded caps/joins, no fills. Icons inherit text color so they tint with
// accent/muted context. Glyph paths lifted verbatim from src/icons.tsx.
const GLYPHS = {
  overview: <path d="M4 11l8-6 8 6M6 10v9h12v-9" />,
  pipeline: (
    <>
      <rect x="4" y="5" width="4" height="14" rx="1" />
      <rect x="10" y="5" width="4" height="9" rx="1" />
      <rect x="16" y="5" width="4" height="6" rx="1" />
    </>
  ),
  feed: (
    <>
      <path d="M5 5a14 14 0 0114 14" />
      <path d="M5 12a7 7 0 017 7" />
      <circle cx="5.5" cy="18.5" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9h16M9 3v4M15 3v4" />
    </>
  ),
  network: (
    <>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
      <path d="M7.7 8.6l3 6.8M16.3 8.6l-3 6.8M8 7h8" />
    </>
  ),
  cv: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.66 6.34l-1.7 1.7M8.04 15.96l-1.7 1.7M17.66 17.66l-1.7-1.7M8.04 8.04l-1.7-1.7" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-5-5" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11h14V8M10 12h4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7.5" x2="12" y2="13" />
      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
};

export const ICON_NAMES = Object.keys(GLYPHS);

export function Icon({ name = "overview", size = 22, strokeWidth = 2, style = {}, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      {...rest}
    >
      {GLYPHS[name] || GLYPHS.overview}
    </svg>
  );
}
