// Tab routing extracted from App.tsx (#285 split): the flat tab<->path
// map and the path parser. A manual History-API layer (the app is a flat
// tab-switcher, not a nested-route tree) — see App() for how it's wired.

export type Tab =
  | "overview"
  | "board"
  | "feed"
  | "insights"
  | "companies"
  | "contacts"
  | "cv"
  | "settings"
  | "admin";

// URL routing (#73) — a small manual History-API layer via
// react-router's useLocation/useNavigate rather than a full <Routes>
// tree, since the app is a flat tab-switcher (no nested routes, no
// route params beyond an optional record id). Only the pipeline deep
// links to a specific record; other tabs are just /path.
export const TAB_PATHS: Record<Tab, string> = {
  overview: "/",
  board: "/board",
  feed: "/feed",
  insights: "/insights",
  companies: "/companies",
  contacts: "/people",
  cv: "/cv",
  settings: "/settings",
  admin: "/admin",
};

export const PATH_TABS: Record<string, Tab> = {
  board: "board",
  feed: "feed",
  insights: "insights",
  companies: "companies",
  people: "contacts",
  cv: "cv",
  settings: "settings",
  admin: "admin",
  // Legacy paths kept resolvable so old links still land somewhere sane;
  // LEGACY_PATHS below rewrites the URL to the canonical one. /jobs was the
  // pipeline's list-only route before the board absorbed it (#488);
  // /activity folded into the Dashboard, /stats and /calendar into Insights
  // (#480, #481).
  jobs: "board",
  activity: "overview",
  stats: "insights",
  calendar: "insights",
};

// Legacy path segment -> canonical path. A deep-linked record id is carried
// over where the canonical route takes one (/jobs/12 -> /board/12).
export const LEGACY_PATHS: Record<string, string> = {
  jobs: "/board",
  activity: "/",
  stats: "/insights",
  calendar: "/insights",
};

const PATH_RE = /^\/([a-z]+)(?:\/(\d+))?\/?$/;

export function parsePath(pathname: string): { tab: Tab; id: number | null } {
  const match = pathname.match(PATH_RE);
  const tab = (match && PATH_TABS[match[1]]) || "overview";
  const id = match && match[2] ? Number(match[2]) : null;
  return { tab, id };
}

// The canonical URL for a legacy path, or null when the path is already
// canonical. Only /board takes an id, so ids on the other legacy paths are
// dropped rather than carried onto a route that can't use them.
export function canonicalPath(pathname: string): string | null {
  const match = pathname.match(PATH_RE);
  if (!match) return null;
  const target = LEGACY_PATHS[match[1]];
  if (!target) return null;
  return match[2] && target === "/board" ? `${target}/${match[2]}` : target;
}

// Radial pipeline ring (#143) — replaces the Jobs-tab histogram with a
// donut: this one is a genuine part-of-a-whole snapshot (how currently-
// open applications break down by stage right now), which is what a
// donut communicates best, in the same compact footprint the histogram
// used. Stats tab's weekly bars (a trend, not a distribution) and
// pipeline funnel (cumulative-reached-per-stage, a different
// denominator, needs the funnel's decreasing-max shape) are untouched —
// this consolidates only the one genuinely overlapping chart.
