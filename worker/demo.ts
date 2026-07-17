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
  "skills",
  "work_experience",
  "education",
  "languages",
  "role_types",
  "feed_sources",
  "feed_role_keywords",
  "profile",
] as const;

export async function resetDemoData(env: Env): Promise<{ seeded: boolean }> {
  const user = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
    .bind(DEMO_EMAIL)
    .first<{ id: string }>();
  if (!user) return { seeded: false };
  const userId = user.id;

  for (const table of USER_TABLES) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run();
  }
  await env.DB.prepare(
    "DELETE FROM feed_item_status WHERE user_id = ?",
  )
    .bind(userId)
    .run();

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
    `INSERT INTO companies (user_id, name, website, location) VALUES (?, 'Globex Recruiting', 'https://globex.example', 'Remote')
     RETURNING id`,
  )
    .bind(userId)
    .first<{ id: number }>();
  const hooli = await env.DB.prepare(
    `INSERT INTO companies (user_id, name, website, location, description) VALUES (?, 'Hooli Systems', 'https://hooli.example', 'Rotterdam, NL', 'Design-systems and frontend tooling company.')
     RETURNING id`,
  )
    .bind(userId)
    .first<{ id: number }>();
  const vandelay = await env.DB.prepare(
    `INSERT INTO companies (user_id, name, website, location) VALUES (?, 'Vandelay Data', 'https://vandelay.example', 'Utrecht, NL')
     RETURNING id`,
  )
    .bind(userId)
    .first<{ id: number }>();

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

  // --- One application per remaining stage so the demo Board looks fully
  // populated (#182): interested, applied, screening, rejected, withdrawn.
  // interview/offer/ghosted are seeded above. ---
  const interested = await env.DB.prepare(
    `INSERT INTO applications (user_id, company_id, title, role_type, url, source, status, notes)
     VALUES (?, ?, 'Frontend Engineer, Design Systems', 'front-end', 'https://hooli.example/careers/17',
             'feed:adzuna', 'interested', 'Saw the posting in the Adzuna feed — strong design-systems focus.')
     RETURNING id`,
  )
    .bind(userId, hooli!.id)
    .first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES (?, ?, NULL, 'interested')`,
  )
    .bind(interested!.id, userId)
    .run();

  const applied = await env.DB.prepare(
    `INSERT INTO applications (user_id, company_id, title, role_type, url, source, status, notes,
        applied_at, next_action, next_action_at)
     VALUES (?, ?, 'Platform Engineer', 'platform-engineer', 'https://globex.example/jobs/88',
             'company-site', 'applied', 'Applied via their careers page.', date('now', '-5 days'),
             'Follow up if no reply', date('now', '+2 days'))
     RETURNING id`,
  )
    .bind(userId, globex!.id)
    .first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES
     (?, ?, NULL, 'interested'), (?, ?, 'interested', 'applied')`,
  )
    .bind(applied!.id, userId, applied!.id, userId)
    .run();

  const screening = await env.DB.prepare(
    `INSERT INTO applications (user_id, company_id, title, role_type, url, source, status, notes, applied_at)
     VALUES (?, ?, 'Site Reliability Engineer', 'other', 'https://vandelay.example/jobs/3',
             'referral', 'screening', 'Recruiter reached out — screening call scheduled.', date('now', '-8 days'))
     RETURNING id`,
  )
    .bind(userId, vandelay!.id)
    .first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES
     (?, ?, NULL, 'applied'), (?, ?, 'applied', 'screening')`,
  )
    .bind(screening!.id, userId, screening!.id, userId)
    .run();

  const rejected = await env.DB.prepare(
    `INSERT INTO applications (user_id, company_id, title, role_type, status, notes, applied_at)
     VALUES (?, ?, 'Senior Frontend Engineer', 'front-end', 'rejected',
             'Rejected after the take-home — not enough React depth, per their feedback.', date('now', '-20 days'))
     RETURNING id`,
  )
    .bind(userId, hooli!.id)
    .first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES
     (?, ?, NULL, 'applied'), (?, ?, 'applied', 'screening'), (?, ?, 'screening', 'rejected')`,
  )
    .bind(rejected!.id, userId, rejected!.id, userId, rejected!.id, userId)
    .run();

  const withdrawn = await env.DB.prepare(
    `INSERT INTO applications (user_id, company_id, title, role_type, status, notes, applied_at)
     VALUES (?, ?, 'Backend Engineer', 'other', 'withdrawn',
             'Withdrew — accepted another process further along.', date('now', '-15 days'))
     RETURNING id`,
  )
    .bind(userId, vandelay!.id)
    .first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status) VALUES
     (?, ?, NULL, 'applied'), (?, ?, 'applied', 'withdrawn')`,
  )
    .bind(withdrawn!.id, userId, withdrawn!.id, userId)
    .run();

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
    .bind(userId, DEMO_EMAIL)
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

  return { seeded: true };
}
