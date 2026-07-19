// Tab routing extracted from App.tsx (#285 split): the flat tab<->path
// map and the path parser. A manual History-API layer (the app is a flat
// tab-switcher, not a nested-route tree) — see App() for how it's wired.

export type Tab =
  | "overview"
  | "applications"
  | "board"
  | "feed"
  | "calendar"
  | "stats"
  | "companies"
  | "contacts"
  | "cv"
  | "settings";

// URL routing (#73) — a small manual History-API layer via
// react-router's useLocation/useNavigate rather than a full <Routes>
// tree, since the app is a flat tab-switcher (no nested routes, no
// route params beyond an optional record id). Only Jobs/Board deep
// link to a specific record; other tabs are just /path.
export const TAB_PATHS: Record<Tab, string> = {
  overview: "/",
  applications: "/jobs",
  board: "/board",
  feed: "/feed",
  calendar: "/calendar",
  stats: "/stats",
  companies: "/companies",
  contacts: "/people",
  cv: "/cv",
  settings: "/settings",
};

export const PATH_TABS: Record<string, Tab> = {
  jobs: "applications",
  board: "board",
  feed: "feed",
  calendar: "calendar",
  // /activity and /stats fold into the Dashboard (#346); old links land there.
  activity: "overview",
  stats: "overview",
  companies: "companies",
  people: "contacts",
  cv: "cv",
  settings: "settings",
};

export function parsePath(pathname: string): { tab: Tab; id: number | null } {
  const match = pathname.match(/^\/([a-z]+)(?:\/(\d+))?\/?$/);
  const tab = (match && PATH_TABS[match[1]]) || "overview";
  const id = match && match[2] ? Number(match[2]) : null;
  return { tab, id };
}

// Radial pipeline ring (#143) — replaces the Jobs-tab histogram with a
// donut: this one is a genuine part-of-a-whole snapshot (how currently-
// open applications break down by stage right now), which is what a
// donut communicates best, in the same compact footprint the histogram
// used. Stats tab's weekly bars (a trend, not a distribution) and
// pipeline funnel (cumulative-reached-per-stage, a different
// denominator, needs the funnel's decreasing-max shape) are untouched —
// this consolidates only the one genuinely overlapping chart.
