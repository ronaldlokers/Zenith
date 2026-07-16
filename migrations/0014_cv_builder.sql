-- CV builder phase 1 (issue #69, part of #68) — data model for a
-- profile header, work experience, education, languages, and a
-- reusable skills table (mirrors the role_types pattern from #45:
-- skills are looked up/created by name, not free-typed duplicates).

-- Singleton profile — always id 1, seeded empty so GET never 404s.
CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin TEXT,
    github TEXT,
    portfolio TEXT,
    summary TEXT
);
INSERT INTO profile (id) VALUES (1);

CREATE TABLE skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE work_experience (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_month INTEGER,
    start_year INTEGER,
    end_month INTEGER,
    end_year INTEGER,
    is_current INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE work_experience_skills (
    work_experience_id INTEGER NOT NULL REFERENCES work_experience(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (work_experience_id, skill_id)
);

CREATE TABLE education (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institution TEXT NOT NULL,
    degree TEXT,
    field TEXT,
    start_month INTEGER,
    start_year INTEGER,
    end_month INTEGER,
    end_year INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    proficiency TEXT NOT NULL CHECK (proficiency IN ('conversational', 'fluent', 'native'))
);
