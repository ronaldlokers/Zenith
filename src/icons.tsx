import type { ReactNode } from "react";

// Empty-state illustrations, nav glyphs, and brand mark (#136/#346) —
// hand-drawn line-art: currentColor strokes, 24x24 (nav/chrome) or 96x96
// (empty states), one accent-stroked highlight. Extracted from App.tsx.

export function EmptyCompaniesIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="18" y="24" width="60" height="52" rx="4" strokeWidth="4" opacity="0.3" />
      <line x1="32" y1="38" x2="40" y2="38" strokeWidth="4" strokeLinecap="round" />
      <line x1="56" y1="38" x2="64" y2="38" strokeWidth="4" strokeLinecap="round" />
      <line x1="32" y1="54" x2="40" y2="54" strokeWidth="4" strokeLinecap="round" />
      <line x1="56" y1="54" x2="64" y2="54" strokeWidth="4" strokeLinecap="round" className="accent-stroke" />
      <line x1="42" y1="76" x2="54" y2="76" strokeWidth="5" opacity="0.5" />
    </svg>
  );
}

export function EmptyPeopleIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="36" cy="34" r="14" strokeWidth="4" opacity="0.35" />
      <path d="M14 78c2-16 14-24 22-24s20 8 22 24" strokeWidth="4" opacity="0.35" strokeLinecap="round" />
      <circle cx="66" cy="30" r="12" strokeWidth="5" className="accent-stroke" />
      <path d="M48 78c2-14 12-21 18-21s16 7 18 21" strokeWidth="5" className="accent-stroke" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyCvIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="24" y="12" width="48" height="72" rx="4" strokeWidth="4" opacity="0.3" />
      <line x1="34" y1="28" x2="62" y2="28" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
      <line x1="34" y1="40" x2="62" y2="40" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      <line x1="34" y1="52" x2="52" y2="52" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      <line x1="34" y1="66" x2="62" y2="66" strokeWidth="5" className="accent-stroke" strokeLinecap="round" />
      <line x1="34" y1="76" x2="50" y2="76" strokeWidth="5" className="accent-stroke" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyFeedIcon() {
  // Radar sweep — the feed scans outside sources for new roles.
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M20 78 A46 46 0 0 1 66 32" strokeWidth="4" opacity="0.28" strokeLinecap="round" />
      <path d="M20 78 A32 32 0 0 1 52 46" strokeWidth="4" opacity="0.5" strokeLinecap="round" />
      <path d="M20 78 A18 18 0 0 1 38 60" strokeWidth="5" className="accent-stroke" strokeLinecap="round" />
      <circle cx="66" cy="32" r="6" strokeWidth="5" className="accent-stroke" />
      <circle cx="20" cy="78" r="4" fill="currentColor" stroke="none" opacity="0.5" />
    </svg>
  );
}

export function EmptyCalendarIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="16" y="22" width="64" height="56" rx="5" strokeWidth="4" opacity="0.3" />
      <line x1="16" y1="38" x2="80" y2="38" strokeWidth="4" opacity="0.3" />
      <line x1="34" y1="13" x2="34" y2="26" strokeWidth="4" opacity="0.5" strokeLinecap="round" />
      <line x1="62" y1="13" x2="62" y2="26" strokeWidth="4" opacity="0.5" strokeLinecap="round" />
      <circle cx="59" cy="58" r="9" strokeWidth="5" className="accent-stroke" />
    </svg>
  );
}

export function EmptyActivityIcon() {
  // Pulse line — events land here once things start moving.
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M10 56 h16 l7-16" strokeWidth="4" opacity="0.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M33 40 44 72 54 44" strokeWidth="5" className="accent-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M54 44 l5 12 h27" strokeWidth="4" opacity="0.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Matches the stroke-based hand-drawn style of the Empty*Icon set (#203) —
// the settings button previously used a bare "⚙" glyph, a third icon
// convention alongside these SVGs and the app's mostly-textual chrome.
export function SearchIcon() {
  return (
    <svg
      className="settings-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" strokeWidth="2" />
      <path d="M20 20l-5-5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Bottom-nav glyphs (#346) — 24x24, currentColor, strokeWidth 2, matching
// SettingsIcon. Shown only on the mobile bottom bar (icon over label); the
// desktop sidebar keeps its text labels.
function navSvg(children: ReactNode) {
  return (
    <svg
      className="nav-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
export const NavOverviewIcon = () =>
  navSvg(<path d="M4 11l8-6 8 6M6 10v9h12v-9" />);
export const NavPipelineIcon = () =>
  navSvg(
    <>
      <rect x="4" y="5" width="4" height="14" rx="1" />
      <rect x="10" y="5" width="4" height="9" rx="1" />
      <rect x="16" y="5" width="4" height="6" rx="1" />
    </>,
  );
export const NavFeedIcon = () =>
  navSvg(
    <>
      <path d="M5 5a14 14 0 0114 14" />
      <path d="M5 12a7 7 0 017 7" />
      <circle cx="5.5" cy="18.5" r="0.6" fill="currentColor" stroke="none" />
    </>,
  );
export const NavCalendarIcon = () =>
  navSvg(
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9h16M9 3v4M15 3v4" />
    </>,
  );
export const NavNetworkIcon = () =>
  navSvg(
    <>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
      <path d="M7.7 8.6l3 6.8M16.3 8.6l-3 6.8M8 7h8" />
    </>,
  );
export const NavInsightsIcon = () =>
  navSvg(
    <>
      <path d="M4 5v14h16" />
      <path d="M7 15l3-4 3 2 4-6" />
    </>,
  );
export const NavCvIcon = () =>
  navSvg(
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>,
  );

export function SettingsIcon() {
  return (
    <svg
      className="settings-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" strokeWidth="2" />
      <path
        d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.66 6.34l-1.7 1.7M8.04 15.96l-1.7 1.7M17.66 17.66l-1.7-1.7M8.04 8.04l-1.7-1.7"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Admin (shield) — nav glyph for the admin-only area (#457), same 24x24
// currentColor / strokeWidth 2 house style.
export function AdminIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6l7-3z"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 11.5l2 2 4-4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Filter (funnel) + Archive (lidded box) glyphs for the board bar chips
// (#346) — same 24x24 currentColor / strokeWidth 2 style as the nav set.
export function FilterIcon() {
  return (
    <svg className="chip-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16l-6 7v6l-4 2v-8z" />
    </svg>
  );
}
export function ArchiveIcon() {
  return (
    <svg className="chip-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11h14V8M10 12h4" />
    </svg>
  );
}

// Matches the stroke-based hand-drawn style of the Empty*Icon set —
// the error banner previously had no icon at all (#206).
export function ErrorIcon() {
  return (
    <svg
      className="error-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <line x1="12" y1="7.5" x2="12" y2="13" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg
      className="bell-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9Z"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function RemoveIcon() {
  return (
    <svg
      className="remove-icon"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 1L9 9M9 1L1 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Inline "edit" pencil for the detail page's edit-in-place controls (#447) —
// replaces a raw ✎ emoji with the app's line-art house style (24×24 grid,
// currentColor, strokeWidth 2).
export function EditIcon() {
  return (
    <svg
      className="inline-edit-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        d="M4 20h4L18 10l-4-4L4 16v4z"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M13 7l4 4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// The Ascent brand mark: a Night squircle with the three-rung ascent path
// rising to a gold peak-star. Fixed brand fills (not currentColor) so it
// matches favicon.svg / the PWA icons exactly. Square; pairs with the "Zenith"
// wordmark in the header.
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="14" fill="#14173a" />
      <rect x="12" y="34" width="24" height="3.4" rx="1.7" fill="#6f78c4" />
      <rect x="15.5" y="27.5" width="17" height="3.4" rx="1.7" fill="#8f7bd0" />
      <rect x="19" y="21" width="10" height="3.4" rx="1.7" fill="#d6a441" />
      <path d="M24 8.5 l1.3 3.4 3.4 1.3 -3.4 1.3 -1.3 3.4 -1.3 -3.4 -3.4 -1.3 3.4 -1.3 Z" fill="#d6a441" />
    </svg>
  );
}
