-- Companies you're applying to or agencies you work with
CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website TEXT,
    location TEXT,
    is_agency INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recruiters, hiring managers, and other contacts
CREATE TABLE contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    role TEXT,
    email TEXT,
    phone TEXT,
    linkedin TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Job applications / leads
CREATE TABLE applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    role_type TEXT NOT NULL DEFAULT 'other'
        CHECK (role_type IN ('devops', 'platform-engineer', 'front-end', 'typescript', 'other')),
    url TEXT,
    source TEXT,
    salary_range TEXT,
    status TEXT NOT NULL DEFAULT 'interested'
        CHECK (status IN ('interested', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'ghosted')),
    notes TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_applications_company ON applications(company_id);
CREATE INDEX idx_applications_status ON applications(status);
