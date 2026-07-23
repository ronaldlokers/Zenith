-- Weekly job-search goal + search start (#473). One row per user; the weekly
-- application target drives the dashboard goal card and streak. search_started_at
-- overrides the auto-derived "week N of your search" (earliest application).
CREATE TABLE user_goals (
    user_id TEXT PRIMARY KEY,
    weekly_app_goal INTEGER NOT NULL DEFAULT 5,
    search_started_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
