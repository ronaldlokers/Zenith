-- Audit trail for admin actions that carry security/privacy weight — who did
-- what to whom (security review: an admin could reset another user's second
-- factor, or impersonate them via Better Auth's admin plugin, and nothing
-- anywhere recorded it, on a product whose pitch is that privacy is
-- structural).
--
-- Same append-only shape as cron_runs (0061) for the same reason — a small
-- INSERT that never blocks the reader — but it differs on one point:
-- cron_runs prunes after 30 days because "did it run recently" is all
-- anyone needs, while an audit record's whole point is that it is kept, so
-- there is no prune here.
--
-- target_id is NOT NULL: both actions this currently records (a 2FA reset,
-- an impersonation) always name a target user. An admin action with no
-- target would need this loosened, which is a migration for whenever that
-- action actually exists.
CREATE TABLE admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The only read planned so far is "everything done to this user", so that's
-- the index shape — same reasoning as cron_runs' (label, ran_at).
CREATE INDEX idx_admin_actions_target ON admin_actions (target_id, created_at DESC);
