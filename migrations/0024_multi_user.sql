-- Multi-user support (#38): every table that holds a user's own data gets
-- a user_id column, scoping every future query to `WHERE user_id = ?`.
--
-- feed_items is deliberately NOT scoped — it stays a shared pool of pulled
-- job listings (Adzuna/HN/Arbeitnow), since re-fetching those externally
-- rate-limited sources once per user would multiply API calls for no
-- benefit. Per-user new/dismissed/added state moves to a new
-- feed_item_status join table instead.
--
-- All existing data is backfilled to a seed admin user (id 'seed-admin')
-- so Ronald's current data keeps working unchanged. The seed user has no
-- password yet — that's set by scripts/seed-admin.mjs after this
-- migration runs, hashing a real password with better-auth's own scrypt
-- implementation and inserting the matching "account" row.
INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
VALUES ('seed-admin', 'Ronald', 'ronald@lokers.email', 1, datetime('now'), datetime('now'), 'admin');

-- --- Simple ADD COLUMN tables (no existing UNIQUE/CHECK/PK to rebuild) ---

ALTER TABLE companies ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE companies SET user_id = 'seed-admin';

ALTER TABLE contacts ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE contacts SET user_id = 'seed-admin';

ALTER TABLE applications ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE applications SET user_id = 'seed-admin';

ALTER TABLE interactions ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE interactions SET user_id = 'seed-admin';

ALTER TABLE status_history ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE status_history SET user_id = 'seed-admin';

ALTER TABLE documents ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE documents SET user_id = 'seed-admin';

ALTER TABLE application_tags ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE application_tags SET user_id = 'seed-admin';

ALTER TABLE work_experience ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE work_experience SET user_id = 'seed-admin';

ALTER TABLE work_experience_skills ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE work_experience_skills SET user_id = 'seed-admin';

ALTER TABLE education ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE education SET user_id = 'seed-admin';

ALTER TABLE languages ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE languages SET user_id = 'seed-admin';

ALTER TABLE interview_prep_items ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE interview_prep_items SET user_id = 'seed-admin';

ALTER TABLE feed_role_keywords ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE feed_role_keywords SET user_id = 'seed-admin';

CREATE INDEX idx_companies_user ON companies(user_id);
CREATE INDEX idx_contacts_user ON contacts(user_id);
CREATE INDEX idx_applications_user ON applications(user_id);
CREATE INDEX idx_interactions_user ON interactions(user_id);
CREATE INDEX idx_status_history_user ON status_history(user_id);
CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_work_experience_user ON work_experience(user_id);
CREATE INDEX idx_education_user ON education(user_id);
CREATE INDEX idx_languages_user ON languages(user_id);
CREATE INDEX idx_interview_prep_user ON interview_prep_items(user_id);
CREATE INDEX idx_feed_role_keywords_user ON feed_role_keywords(user_id);

-- --- Rebuild tables: dropping a global UNIQUE/CHECK/PK for a per-user one ---
-- (Built new-name-first, then renamed into place — see 0010's note on why
-- D1's local emulation requires ending on ALTER TABLE ... RENAME rather
-- than renaming the old table out of the way first.)

-- profile: singleton (id=1) becomes one row per user
CREATE TABLE profile_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin TEXT,
    github TEXT,
    portfolio TEXT,
    summary TEXT,
    share_token TEXT UNIQUE
);
INSERT INTO profile_new (user_id, name, email, phone, location, linkedin, github, portfolio, summary, share_token)
SELECT 'seed-admin', name, email, phone, location, linkedin, github, portfolio, summary, share_token FROM profile;
DROP TABLE profile;
ALTER TABLE profile_new RENAME TO profile;

-- skills: name UNIQUE globally -> UNIQUE per user
CREATE TABLE skills_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (user_id, name)
);
INSERT INTO skills_new (id, user_id, name)
SELECT id, 'seed-admin', name FROM skills;
DROP TABLE skills;
ALTER TABLE skills_new RENAME TO skills;

-- role_types: slug UNIQUE globally -> UNIQUE per user
CREATE TABLE role_types_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, slug)
);
INSERT INTO role_types_new (id, user_id, slug, label, sort_order)
SELECT id, 'seed-admin', slug, label, sort_order FROM role_types;
DROP TABLE role_types;
ALTER TABLE role_types_new RENAME TO role_types;

-- tags: name UNIQUE globally -> UNIQUE per user
CREATE TABLE tags_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (user_id, name)
);
INSERT INTO tags_new (id, user_id, name)
SELECT id, 'seed-admin', name FROM tags;
DROP TABLE tags;
ALTER TABLE tags_new RENAME TO tags;

-- feed_sources: source was the PRIMARY KEY (one row per source, global) ->
-- one row per (user, source)
CREATE TABLE feed_sources_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('adzuna', 'hn', 'arbeitnow')),
    enabled INTEGER NOT NULL DEFAULT 1,
    location TEXT,
    UNIQUE (user_id, source)
);
INSERT INTO feed_sources_new (user_id, source, enabled, location)
SELECT 'seed-admin', source, enabled, location FROM feed_sources;
DROP TABLE feed_sources;
ALTER TABLE feed_sources_new RENAME TO feed_sources;

-- --- Shared feed pool: per-user new/dismissed/added state ---
-- Absence of a row for (feed_item_id, user_id) means "new" for that user.
CREATE TABLE feed_item_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_item_id INTEGER NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'added', 'dismissed')),
    UNIQUE (feed_item_id, user_id)
);
-- Backfill: any feed_item already marked non-'new' globally becomes that
-- status for the seed admin specifically (the only user who could have
-- dismissed/added it so far), then the global column stops being read.
INSERT INTO feed_item_status (feed_item_id, user_id, status)
SELECT id, 'seed-admin', status FROM feed_items WHERE status != 'new';

CREATE INDEX idx_feed_item_status_user ON feed_item_status(user_id);
