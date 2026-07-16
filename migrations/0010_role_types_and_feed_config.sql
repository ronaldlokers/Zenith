-- Role types become a configurable list instead of a hardcoded enum
-- (issue #45). Seeded with today's five values so existing data and
-- behavior are unchanged after migration.
CREATE TABLE role_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO role_types (slug, label, sort_order) VALUES
    ('devops', 'DevOps', 0),
    ('platform-engineer', 'Platform Engineer', 1),
    ('front-end', 'Front-end', 2),
    ('typescript', 'TypeScript', 3),
    ('other', 'Other', 4);

-- Drop the role_type CHECK constraint on applications (SQLite can't
-- alter a constraint in place — rebuild). Validity is now enforced at
-- the application layer against the role_types table above, since the
-- list can change.
--
-- Built new-name-first, then renamed into place at the end (rather
-- than renaming the old table out of the way first) — D1's local
-- emulation (reproduced identically via the Worker's D1 binding,
-- `wrangler d1 execute`, and vitest-pool-workers, though never via
-- raw sqlite3 on the same file) leaves a stale schema reference
-- behind when a table is renamed away and a new table is created
-- under its old name within the same session, breaking every
-- subsequent write with "no such table: applications_old". Ending on
-- a genuine ALTER TABLE ... RENAME avoids it.
CREATE TABLE applications_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    role_type TEXT NOT NULL DEFAULT 'other',
    url TEXT,
    source TEXT,
    salary_range TEXT,
    status TEXT NOT NULL DEFAULT 'interested'
        CHECK (status IN ('interested', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'ghosted')),
    notes TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    next_action TEXT,
    next_action_at TEXT,
    salary_currency TEXT,
    salary_min INTEGER,
    salary_max INTEGER,
    salary_period TEXT CHECK (salary_period IS NULL OR salary_period IN ('year', 'month'))
);

INSERT INTO applications_new SELECT * FROM applications;
DROP TABLE applications;
ALTER TABLE applications_new RENAME TO applications;

CREATE INDEX idx_applications_company ON applications(company_id);
CREATE INDEX idx_applications_status ON applications(status);

-- The status_history AFTER INSERT/UPDATE triggers that lived on the old
-- applications table are intentionally NOT recreated here. D1's local
-- emulation (reproduced via both the Worker's D1 binding and
-- `wrangler d1 execute`, never via raw sqlite3 on the same file) binds
-- a trigger surviving a same-name rename/drop/recreate to a stale
-- internal table reference, breaking every subsequent INSERT with
-- "no such table: applications_old". status_history recording moves
-- to the application layer instead (see worker/index.ts), which is
-- portable and avoids depending on this emulation behavior.

-- Same rebuild for feed_items' role_type CHECK constraint
CREATE TABLE feed_items_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL CHECK (source IN ('adzuna', 'hn', 'arbeitnow')),
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    url TEXT,
    salary_text TEXT,
    role_type TEXT NOT NULL DEFAULT 'other',
    posted_at TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'added', 'dismissed')),
    UNIQUE (source, external_id)
);

INSERT INTO feed_items_new SELECT * FROM feed_items;
DROP TABLE feed_items;
ALTER TABLE feed_items_new RENAME TO feed_items;

CREATE INDEX idx_feed_items_status ON feed_items(status);

-- Feed source configuration: enabled state and location filter per source
CREATE TABLE feed_sources (
    source TEXT PRIMARY KEY CHECK (source IN ('adzuna', 'hn', 'arbeitnow')),
    enabled INTEGER NOT NULL DEFAULT 1,
    location TEXT
);

INSERT INTO feed_sources (source, enabled, location) VALUES
    ('adzuna', 1, 'nl'),
    ('hn', 1, NULL),
    ('arbeitnow', 1, NULL);

-- Search keywords per role, replacing the hardcoded ROLE_KEYWORDS map
CREATE TABLE feed_role_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_slug TEXT NOT NULL,
    keyword TEXT NOT NULL
);

INSERT INTO feed_role_keywords (role_slug, keyword) VALUES
    ('devops', 'devops'),
    ('devops', 'site reliability'),
    ('devops', 'sre'),
    ('devops', 'infrastructure engineer'),
    ('platform-engineer', 'platform engineer'),
    ('platform-engineer', 'cloud engineer'),
    ('platform-engineer', 'platform team'),
    ('front-end', 'front-end'),
    ('front-end', 'frontend'),
    ('front-end', 'front end'),
    ('front-end', 'ui engineer'),
    ('front-end', 'react developer'),
    ('typescript', 'typescript'),
    ('typescript', 'node.js developer'),
    ('typescript', 'full-stack'),
    ('typescript', 'fullstack');

CREATE INDEX idx_feed_role_keywords_role ON feed_role_keywords(role_slug);
