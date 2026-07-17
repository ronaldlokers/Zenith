// Demo account data (#38): a real admin-created user (see the "Invite a
// user" form in Settings) whose data gets wiped and reseeded with one
// example of every shipped feature, so it can be shown/tested on
// production without touching anyone's real pipeline. Extend SEED_* below
// as new features ship.
const DEMO_EMAIL = "demo@jobseekr.lokilabs.nl";

const USER_TABLES = [
  "documents",
  "interactions",
  "status_history",
  "application_tags",
  "work_experience_skills",
  "interview_prep_items",
  "applications",
  "contacts",
  "companies",
  "tags",
  "saved_views",
  "skills",
  "work_experience",
  "education",
  "languages",
  "role_types",
  "feed_sources",
  "feed_role_keywords",
  "profile",
] as const;

// Delete every user-scoped row for one user. Shared by the demo reset and
// the per-user sample-data toggle (#281).
export async function wipeUserData(env: Env, userId: string): Promise<void> {
  for (const table of USER_TABLES) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`)
      .bind(userId)
      .run();
  }
  await env.DB.prepare("DELETE FROM feed_item_status WHERE user_id = ?")
    .bind(userId)
    .run();
}

export async function resetDemoData(env: Env): Promise<{ seeded: boolean }> {
  const user = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
    .bind(DEMO_EMAIL)
    .first<{ id: string }>();
  if (!user) return { seeded: false };
  await wipeUserData(env, user.id);
  await seedSampleData(env, user.id, DEMO_EMAIL);
  return { seeded: true };
}

// Populate one (wiped) account with one example of every shipped feature.
// The demo account and the per-user "load sample data" toggle both use it.
export async function seedSampleData(
  env: Env,
  userId: string,
  email: string,
): Promise<void> {
  // --- Role types + feed config (#45, #34) ---
  await env.DB.prepare(
    `INSERT INTO role_types (user_id, slug, label, sort_order) VALUES
     (?, 'platform-engineer', 'Platform Engineer', 0),
     (?, 'front-end', 'Front-end', 1),
     (?, 'other', 'Other', 2)`,
  )
    .bind(userId, userId, userId)
    .run();
  await env.DB.prepare(
    `INSERT INTO feed_sources (user_id, source, enabled, location) VALUES
     (?, 'adzuna', 1, 'nl'), (?, 'hn', 1, NULL)`,
  )
    .bind(userId, userId)
    .run();
  await env.DB.prepare(
    "INSERT INTO feed_role_keywords (user_id, role_slug, keyword) VALUES (?, 'platform-engineer', 'platform engineer')",
  )
    .bind(userId)
    .run();

  // --- Companies (#1, research #35) ---
  const acme = await env.DB.prepare(
    `INSERT INTO companies (user_id, name, website, location, description, logo_url, researched_at)
     VALUES (?, 'Acme Cloud', 'https://acme.example', 'Amsterdam, NL', 'Cloud infrastructure platform for mid-market SaaS.', NULL, datetime('now'))
     RETURNING id`,
  )
    .bind(userId)
    .first<{ id: number }>();
  const globex = await env.DB.prepare(
    `INSERT INTO companies (user_id, name, website, location, is_agency) VALUES (?, 'Globex Recruiting', 'https://globex.example', 'Remote', 1)
     RETURNING id`,
  )
    .bind(userId)
    .first<{ id: number }>();

  // More companies so the board's company/role-type filters have variety
  // (#182). is_agency flags recruitment agencies (agency-looking names).
  const companyIds = new Map<string, number>([
    ["Acme Cloud", acme!.id],
    ["Globex Recruiting", globex!.id],
  ]);
  const moreCompanies: [name: string, location: string, isAgency: boolean][] = [
    ["Hooli Systems", "Rotterdam, NL", false],
    ["Vandelay Data", "Utrecht, NL", false],
    ["Zenith Robotics", "Eindhoven, NL", false],
    ["Bluewave Fintech", "Amsterdam, NL", false],
    ["Northwind Logistics", "Rotterdam, NL", false],
    ["Pied Piper", "Remote", false],
    ["Umbrella Analytics", "The Hague, NL", false],
    ["Stark Industries", "Amsterdam, NL", false],
    ["Wonka Labs", "Utrecht, NL", false],
    ["Aperture Labs", "Delft, NL", false],
    ["Cyberdyne Systems", "Eindhoven, NL", false],
    ["Massive Dynamic", "Remote", false],
    ["TalentBridge Recruitment", "Amsterdam, NL", true],
    ["Peak Search Partners", "Remote", true],
    ["Nimbus Staffing", "Rotterdam, NL", true],
    ["Catalyst Talent Group", "Utrecht, NL", true],
  ];
  for (const [name, location, isAgency] of moreCompanies) {
    const row = await env.DB.prepare(
      `INSERT INTO companies (user_id, name, location, is_agency) VALUES (?, ?, ?, ?) RETURNING id`,
    )
      .bind(userId, name, location, isAgency ? 1 : 0)
      .first<{ id: number }>();
    companyIds.set(name, row!.id);
  }

  // --- Contacts + outreach tracking (#110) ---
  const contact = await env.DB.prepare(
    `INSERT INTO contacts (user_id, company_id, name, role, email, linkedin, outreach_status, last_contacted_at, follow_up_at)
     VALUES (?, ?, 'Jamie Park', 'Talent Partner', 'jamie@globex.example', 'https://linkedin.com/in/jamiepark', 'awaiting_reply', date('now', '-3 days'), date('now', '+2 days'))
     RETURNING id`,
  )
    .bind(userId, globex!.id)
    .first<{ id: number }>();

  // --- Applications across the pipeline, with fit score, referral,
  // deadline, and offer detail examples (#101, #103, #105, #109, #112) ---
  const interview = await env.DB.prepare(
    `INSERT INTO applications
       (user_id, company_id, contact_id, title, role_type, url, source, status, notes,
        applied_at, next_action, next_action_at, deadline_at, fit_score)
     VALUES (?, ?, ?, 'Senior Platform Engineer', 'platform-engineer', 'https://acme.example/jobs/42',
             'referral', 'interview', 'Warm intro via Jamie.', date('now', '-10 days'),
             'Prep system design round', date('now', '+3 days'), date('now', '+14 days'), 4)
     RETURNING id, status`,
  )
    .bind(userId, acme!.id, contact!.id)
    .first<{ id: number; status: string }>();
  await env.DB.prepare(
    `INSERT INTO interview_prep_items (application_id, user_id, text, sort_order) VALUES
     (?, ?, 'Research the interviewer''s background and the team', 0),
     (?, ?, 'Prepare 3 questions to ask them', 1)`,
  )
    .bind(interview!.id, userId, interview!.id, userId)
    .run();
  await env.DB.prepare(
    `INSERT INTO interactions (application_id, user_id, type, happened_at, notes) VALUES
     (?, ?, 'call', date('now', '-9 days'), 'Recruiter screen — went well'),
     (?, ?, 'interview', date('now', '-2 days'), 'Technical round with the platform team')`,
  )
    .bind(interview!.id, userId, interview!.id, userId)
    .run();
  for (const [from, to] of [
    [null, "interested"],
    ["interested", "applied"],
    ["applied", "screening"],
    ["screening", "interview"],
  ] as const) {
    await env.DB.prepare(
      `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES (?, ?, ?, ?)`,
    )
      .bind(interview!.id, userId, from, to)
      .run();
  }

  const offer = await env.DB.prepare(
    `INSERT INTO applications
       (user_id, company_id, title, role_type, status, applied_at,
        salary_currency, salary_min, salary_max, salary_period,
        signing_bonus, bonus_target_pct, equity_value, benefits_notes)
     VALUES (?, ?, 'Staff Frontend Engineer', 'front-end', 'offer', date('now', '-30 days'),
             'EUR', 95000, 105000, 'year', 5000, 10, 12000, '25 vacation days, remote-first')
     RETURNING id`,
  )
    .bind(userId, acme!.id)
    .first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES
     (?, ?, NULL, 'applied'), (?, ?, 'applied', 'offer')`,
  )
    .bind(offer!.id, userId, offer!.id, userId)
    .run();

  const ghosted = await env.DB.prepare(
    `INSERT INTO applications (user_id, company_id, title, role_type, status, applied_at, source)
     VALUES (?, ?, 'DevOps Engineer', 'other', 'ghosted', date('now', '-45 days'), 'feed:hn')
     RETURNING id`,
  )
    .bind(userId, globex!.id)
    .first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES (?, ?, NULL, 'ghosted')`,
  )
    .bind(ghosted!.id, userId)
    .run();

  // --- Bulk applications scattered (unevenly) across every stage so the
  // demo Board looks like a real, in-progress search (#182). The three
  // feature-rich examples above (interview/offer/ghosted) stay; these fill
  // out the columns. Each gets a plausible status_history trail derived
  // from its final status. ---
  const FUNNEL = ["interested", "applied", "screening", "interview", "offer"];
  // Ordered stage path a row passed through before landing on its status.
  function historyFor(status: string): (string | null)[] {
    if (FUNNEL.includes(status)) {
      return [null, ...FUNNEL.slice(0, FUNNEL.indexOf(status) + 1)];
    }
    const terminal: Record<string, string[]> = {
      rejected: ["interested", "applied", "screening", "rejected"],
      withdrawn: ["interested", "applied", "withdrawn"],
      ghosted: ["interested", "applied", "ghosted"],
    };
    return [null, ...terminal[status]];
  }

  type DemoApp = {
    company: string;
    title: string;
    role: string;
    status: string;
    daysAgo?: number; // applied_at; omit for leads not yet applied to
    notes?: string;
  };
  const demoApps: DemoApp[] = [
    // interested (8) — top of funnel, most rows
    { company: "Zenith Robotics", title: "Platform Engineer", role: "platform-engineer", status: "interested", notes: "Interesting robotics infra role." },
    { company: "Bluewave Fintech", title: "Frontend Engineer", role: "front-end", status: "interested" },
    { company: "TalentBridge Recruitment", title: "Senior Platform Engineer", role: "platform-engineer", status: "interested", notes: "Agency reached out on LinkedIn." },
    { company: "Pied Piper", title: "Full-stack Engineer", role: "other", status: "interested" },
    { company: "Umbrella Analytics", title: "Data Platform Engineer", role: "platform-engineer", status: "interested" },
    { company: "Wonka Labs", title: "Frontend Engineer", role: "front-end", status: "interested", notes: "Saw it in the Adzuna feed." },
    { company: "Peak Search Partners", title: "DevOps Engineer", role: "other", status: "interested" },
    { company: "Massive Dynamic", title: "Frontend Platform Engineer", role: "front-end", status: "interested" },
    // applied (7)
    { company: "Northwind Logistics", title: "Platform Engineer", role: "platform-engineer", status: "applied", daysAgo: 4 },
    { company: "Stark Industries", title: "Senior Frontend Engineer", role: "front-end", status: "applied", daysAgo: 6, notes: "Strong design-systems team." },
    { company: "Nimbus Staffing", title: "Kubernetes Engineer", role: "platform-engineer", status: "applied", daysAgo: 3 },
    { company: "Aperture Labs", title: "Site Reliability Engineer", role: "other", status: "applied", daysAgo: 9 },
    { company: "Cyberdyne Systems", title: "Platform Engineer", role: "platform-engineer", status: "applied", daysAgo: 2 },
    { company: "Bluewave Fintech", title: "React Engineer", role: "front-end", status: "applied", daysAgo: 7 },
    { company: "Catalyst Talent Group", title: "Cloud Engineer", role: "other", status: "applied", daysAgo: 5, notes: "Via agency." },
    // screening (4)
    { company: "Zenith Robotics", title: "Senior Platform Engineer", role: "platform-engineer", status: "screening", daysAgo: 11 },
    { company: "Umbrella Analytics", title: "Frontend Engineer", role: "front-end", status: "screening", daysAgo: 8, notes: "Recruiter screen next week." },
    { company: "TalentBridge Recruitment", title: "DevOps Engineer", role: "other", status: "screening", daysAgo: 10 },
    { company: "Pied Piper", title: "Platform Engineer", role: "platform-engineer", status: "screening", daysAgo: 13 },
    // interview (2)
    { company: "Stark Industries", title: "Staff Platform Engineer", role: "platform-engineer", status: "interview", daysAgo: 16, notes: "Onsite loop scheduled." },
    { company: "Wonka Labs", title: "Senior Frontend Engineer", role: "front-end", status: "interview", daysAgo: 14 },
    // offer (1)
    { company: "Northwind Logistics", title: "Platform Engineer", role: "platform-engineer", status: "offer", daysAgo: 28, notes: "Verbal offer — awaiting written." },
    // rejected (4)
    { company: "Cyberdyne Systems", title: "Frontend Engineer", role: "front-end", status: "rejected", daysAgo: 22, notes: "Not enough React depth, per feedback." },
    { company: "Peak Search Partners", title: "Platform Engineer", role: "platform-engineer", status: "rejected", daysAgo: 25 },
    { company: "Massive Dynamic", title: "Site Reliability Engineer", role: "other", status: "rejected", daysAgo: 30 },
    { company: "Aperture Labs", title: "Frontend Engineer", role: "front-end", status: "rejected", daysAgo: 19 },
    // withdrawn (1)
    { company: "Nimbus Staffing", title: "Backend Engineer", role: "other", status: "withdrawn", daysAgo: 18, notes: "Withdrew — accepted another process." },
  ];
  for (const app of demoApps) {
    const companyId = companyIds.get(app.company)!;
    const appliedAt = app.daysAgo ? `date('now', '-${app.daysAgo} days')` : "NULL";
    const row = await env.DB.prepare(
      `INSERT INTO applications (user_id, company_id, title, role_type, status, notes, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ${appliedAt}) RETURNING id`,
    )
      .bind(userId, companyId, app.title, app.role, app.status, app.notes ?? null)
      .first<{ id: number }>();
    const path = historyFor(app.status);
    for (let i = 1; i < path.length; i++) {
      await env.DB.prepare(
        `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES (?, ?, ?, ?)`,
      )
        .bind(row!.id, userId, path[i - 1], path[i])
        .run();
    }
  }

  // --- Tags (#102) ---
  const dreamTag = await env.DB.prepare(
    "INSERT INTO tags (user_id, name) VALUES (?, 'dream job') RETURNING id",
  )
    .bind(userId)
    .first<{ id: number }>();
  await env.DB.prepare(
    "INSERT INTO application_tags (application_id, tag_id, user_id) VALUES (?, ?, ?)",
  )
    .bind(interview!.id, dreamTag!.id, userId)
    .run();

  // --- CV builder (#69) ---
  await env.DB.prepare(
    `INSERT INTO profile (user_id, name, email, location, linkedin, github, summary) VALUES
     (?, 'Demo Candidate', ?, 'Amsterdam, NL', 'https://linkedin.com/in/demo', 'https://github.com/demo',
      'Platform engineer with 8 years building developer infrastructure.')`,
  )
    .bind(userId, email)
    .run();
  const skill = await env.DB.prepare(
    "INSERT INTO skills (user_id, name) VALUES (?, 'Kubernetes') RETURNING id",
  )
    .bind(userId)
    .first<{ id: number }>();
  const workExp = await env.DB.prepare(
    `INSERT INTO work_experience (user_id, company, title, description, start_month, start_year, is_current, sort_order)
     VALUES (?, 'Initech', 'Platform Engineer', 'Built the internal deploy platform.', 3, 2021, 1, 0)
     RETURNING id`,
  )
    .bind(userId)
    .first<{ id: number }>();
  await env.DB.prepare(
    "INSERT INTO work_experience_skills (work_experience_id, skill_id, user_id) VALUES (?, ?, ?)",
  )
    .bind(workExp!.id, skill!.id, userId)
    .run();
  await env.DB.prepare(
    `INSERT INTO education (user_id, institution, degree, field, start_year, end_year, sort_order)
     VALUES (?, 'TU Delft', 'MSc', 'Computer Science', 2015, 2019, 0)`,
  )
    .bind(userId)
    .run();
  await env.DB.prepare(
    "INSERT INTO languages (user_id, name, proficiency) VALUES (?, 'English', 'fluent'), (?, 'Dutch', 'native')",
  )
    .bind(userId, userId)
    .run();
}
