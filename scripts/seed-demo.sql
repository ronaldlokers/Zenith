-- Demo/screenshot seed data — LOCAL ONLY. Do not run against --remote.
--
-- Populates the local D1 database with a realistic, fully-populated account
-- (companies, contacts, ~15 applications across every pipeline stage, one
-- application rich enough to exercise all three detail tabs, CV content,
-- and a few feed listings) so every app view renders populated rather than
-- empty. This exists to give the zero-diff screenshot harness something to
-- diff: a baseline captured against an empty account renders empty states
-- everywhere and covers none of the controls that only appear with data
-- (board cards + the "⋯" card menu, application detail tabs, row overflow
-- menus, feed cards, CV entries, timeline rows, company/contact tiles).
--
-- Apply (after migrations, against the LOCAL db only):
--   npx wrangler d1 migrations apply zenith --local
--   npx wrangler d1 execute zenith --local --file scripts/seed-demo.sql
--
-- Every id used here is >= 9000 — an obviously-demo range that won't
-- collide with real data — and every date is a hardcoded ISO string (no
-- datetime('now'), no random()) anchored around 2026-07-29. That's
-- deliberate: a screenshot baseline has to be reproducible byte-for-byte
-- across runs and across days, and relative "now"-based dates would drift
-- the due/overdue/upcoming split (and every "Nd ago" label) on every run.
-- All rows attach to the seed admin user created by migration 0024
-- (id 'seed-admin', see scripts/seed-admin.mjs). Every person/company name
-- below is fictional.
--
-- Idempotent: deletes its own id range first (children before parents),
-- then re-inserts, so it's safe to run again after schema or content
-- changes here.

-- --- Clean slate for the demo id range (children before parents) ---
DELETE FROM work_experience_skills WHERE work_experience_id IN (9801, 9802);
DELETE FROM application_tags WHERE application_id BETWEEN 9001 AND 9015;
DELETE FROM interview_prep_items WHERE id BETWEEN 9401 AND 9404;
DELETE FROM documents WHERE id BETWEEN 9301 AND 9303;
DELETE FROM status_history WHERE id BETWEEN 9201 AND 9242;
DELETE FROM interactions WHERE id BETWEEN 9101 AND 9110;
DELETE FROM applications WHERE id BETWEEN 9001 AND 9015;
DELETE FROM contacts WHERE id BETWEEN 9001 AND 9008;
DELETE FROM companies WHERE id BETWEEN 9001 AND 9006;
DELETE FROM tags WHERE id BETWEEN 9501 AND 9503;
DELETE FROM feed_items WHERE id BETWEEN 9601 AND 9605;
DELETE FROM education WHERE id = 9910;
DELETE FROM languages WHERE id IN (9911, 9912);
DELETE FROM work_experience WHERE id IN (9801, 9802);
DELETE FROM skills WHERE id BETWEEN 9701 AND 9706;
DELETE FROM cv_versions WHERE id = 9920;

-- --- Companies ---
-- (id, name, website, location, is_agency, notes, created_at, description, logo_url, researched_at, user_id)
INSERT INTO companies (id, name, website, location, is_agency, notes, created_at, description, logo_url, researched_at, user_id) VALUES
  (9001, 'Northwind Cloud', 'https://northwindcloud.example', 'Amsterdam, NL', 0,
    'Infra platform team, met via a meetup talk.', '2026-06-01 09:00:00',
    'Northwind Cloud builds managed Kubernetes and observability tooling for mid-market SaaS companies.',
    NULL, '2026-06-05 09:00:00', 'seed-admin'),
  (9002, 'Lumen Robotics', 'https://lumenrobotics.example', 'Berlin, DE', 0,
    NULL, '2026-05-10 09:00:00',
    'Lumen Robotics builds warehouse robotics and fleet-management software.',
    NULL, '2026-05-12 09:00:00', 'seed-admin'),
  (9003, 'Fieldstone Analytics', 'https://fieldstoneanalytics.example', 'Remote (EU)', 0,
    'Series B, hiring across the board.', '2026-02-05 09:00:00',
    'Fieldstone Analytics is a data-analytics platform for logistics companies.',
    NULL, NULL, 'seed-admin'),
  (9004, 'Brightpath Talent Partners', 'https://brightpathtalent.example', 'Amsterdam, NL', 1,
    'Recruiter agency, handles several of my leads.', '2026-02-20 09:00:00',
    NULL, NULL, NULL, 'seed-admin'),
  (9005, 'Solace Systems', 'https://solacesystems.example', 'Rotterdam, NL', 0,
    NULL, '2026-04-01 09:00:00',
    'Solace Systems builds payments infrastructure for European fintechs.',
    NULL, '2026-04-03 09:00:00', 'seed-admin'),
  (9006, 'Ferro & Vale Recruiting', NULL, 'Utrecht, NL', 1,
    'Cold-outreach agency, mixed results so far.', '2026-03-01 09:00:00',
    NULL, NULL, NULL, 'seed-admin');

-- --- Contacts ---
-- (id, company_id, name, role, email, phone, linkedin, notes, created_at, last_contacted_at, follow_up_at, outreach_status, user_id)
INSERT INTO contacts (id, company_id, name, role, email, phone, linkedin, notes, created_at, last_contacted_at, follow_up_at, outreach_status, user_id) VALUES
  (9001, 9001, 'Mira Doyle', 'Engineering Manager', 'mira.doyle@northwindcloud.example', NULL,
    'https://linkedin.com/in/miradoyle-demo', 'Warm, responds fast.', '2026-06-08 09:00:00',
    '2026-07-24 00:00:00', '2026-08-02', 'replied', 'seed-admin'),
  (9002, 9001, 'Tomasz Wren', 'Recruiter', 'tomasz.wren@northwindcloud.example', NULL,
    NULL, NULL, '2026-06-08 09:00:00',
    '2026-07-18 00:00:00', '2026-07-25', 'awaiting_reply', 'seed-admin'),
  (9003, 9002, 'Priya Chandran', 'Hiring Manager', 'priya.chandran@lumenrobotics.example', NULL,
    NULL, NULL, '2026-05-10 09:00:00',
    NULL, NULL, 'not_contacted', 'seed-admin'),
  (9004, 9003, 'Owen Baptiste', 'Talent Partner', 'owen.baptiste@fieldstoneanalytics.example', NULL,
    NULL, NULL, '2026-02-05 09:00:00',
    '2026-07-15 00:00:00', NULL, 'replied', 'seed-admin'),
  (9005, 9004, 'Sanne Verhoeven', 'Agency Recruiter', 'sanne@brightpathtalent.example', '+31 6 5551 2233',
    NULL, NULL, '2026-02-20 09:00:00',
    '2026-07-10 00:00:00', '2026-08-05', 'awaiting_reply', 'seed-admin'),
  (9006, 9005, 'Diego Fontaine', 'CTO', 'diego@solacesystems.example', NULL,
    'https://linkedin.com/in/diegofontaine-demo', NULL, '2026-04-01 09:00:00',
    NULL, NULL, 'not_contacted', 'seed-admin'),
  (9007, 9006, 'Ingrid Sorel', 'Agency Recruiter', 'ingrid@ferrovale.example', NULL,
    NULL, NULL, '2026-03-01 09:00:00',
    '2026-06-20 00:00:00', NULL, 'no_response', 'seed-admin'),
  (9008, NULL, 'Alex Ummer', 'Former colleague (referral)', 'alex.ummer@example.com', NULL,
    NULL, 'Referred me into Solace Systems.', '2026-07-14 09:00:00',
    '2026-07-16 00:00:00', NULL, 'replied', 'seed-admin');

-- --- Tags ---
INSERT INTO tags (id, user_id, name) VALUES
  (9501, 'seed-admin', 'Dream job'),
  (9502, 'seed-admin', 'Remote-first'),
  (9503, 'seed-admin', 'Backup');

-- --- Applications (15, spread across all five pipeline stages plus dead states) ---
-- Stages: interested x3 (9006-9008), applied x3 (9004,9005,9009),
-- screening x2 (9002,9003), interview x2 (9001,9010), offer x1 (9011),
-- rejected x2 (9012,9013 archived), ghosted x1 (9014), withdrawn x1 (9015).
-- 9001 is the "rich" application: job description, cover letter, notes,
-- documents, interactions, prep items, a follow-up date, and a fit rating.
INSERT INTO applications (
  id, company_id, contact_id, title, role_type, url, source, salary_range, salary_currency, salary_min, salary_max, salary_period, signing_bonus, bonus_target_pct, equity_value, benefits_notes, referred_by_contact_id, posting_status, posting_checked_at, status, notes, applied_at, created_at, updated_at, next_action, next_action_at, deadline_at, archived_at, fit_score, cover_letter, job_description, job_description_captured_at, user_id
) VALUES
  (9001, 9001, 9001, 'Senior Platform Engineer', 'platform-engineer', 'https://northwindcloud.example/careers/senior-platform-engineer', 'company site', '€75,000 – €90,000', 'EUR', 75000, 90000, 'year', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'interview', 'Second-round interviews going well; team leans heavily on SRE practice and blameless postmortems.', '2026-06-15', '2026-06-08 09:00:00', '2026-07-24 16:45:00', 'Prep for the system-design round', '2026-08-03', '2026-08-10', NULL, 5, 'Dear Northwind Cloud team,

I''m applying for the Senior Platform Engineer role. Over the past three years at Vantage Digital I led our migration to Kubernetes and built the internal developer platform that cut our average deploy time by 70% — work that maps closely to what this role describes.

What draws me to Northwind specifically is the size of the team relative to the scope: a six-person platform team supporting the whole company means real ownership, not just executing someone else''s roadmap. I''ve spent the last two years doing exactly that kind of high-leverage infrastructure work, including running incident response and mentoring less senior engineers.

I''d welcome the chance to talk through how I could help harden your multi-tenant clusters and extend the self-service tooling story.

Best,
Jordan Ellis', 'Northwind Cloud is looking for a Senior Platform Engineer to join our infrastructure team.

You''ll own the internal developer platform that our product teams deploy on top of — Kubernetes, Terraform, and the CI/CD pipeline that ships roughly 200 deploys a week. We''re a small team (6 engineers) supporting the whole company, so you''ll have a lot of ownership from day one.

What you''ll do:
- Harden our multi-tenant Kubernetes clusters and improve our on-call story
- Build self-service tooling so product teams can provision infrastructure without filing a ticket
- Drive incident response and blameless postmortems
- Mentor two mid-level engineers on the team

What we''re looking for:
- 5+ years running production Kubernetes at scale
- Strong Terraform and CI/CD experience
- Comfortable being the most senior infra voice in the room
- Based in or willing to relocate to the Netherlands (hybrid, 2 days/week in Amsterdam)

We offer a competitive salary, equity, and a genuinely blameless on-call culture.', '2026-06-08 09:05:00', 'seed-admin'),
  (9002, 9002, 9003, 'DevOps Engineer', 'devops', 'https://lumenrobotics.example/careers/devops-engineer', 'job board', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'screening', 'Waiting to hear back after the recruiter screen — following up this week.', '2026-07-05', '2026-06-28 09:00:00', '2026-07-12 09:00:00', 'Follow up if no response by Friday', '2026-07-22', NULL, NULL, 4, NULL, NULL, NULL, 'seed-admin'),
  (9003, 9003, 9004, 'Staff TypeScript Engineer', 'typescript', 'https://fieldstoneanalytics.example/jobs/staff-typescript-engineer', 'job board', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'screening', 'Take-home exercise submitted, waiting on next steps.', '2026-07-10', '2026-07-08 09:00:00', '2026-07-16 09:00:00', 'Check in on the take-home review', '2026-08-01', NULL, NULL, 3, NULL, NULL, NULL, 'seed-admin'),
  (9004, 9005, 9006, 'Front-end Engineer', 'front-end', 'https://solacesystems.example/careers/front-end-engineer', 'referral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9008, NULL, NULL, 'applied', 'Alex referred me directly to Diego — should hear back quickly.', '2026-07-18', '2026-07-16 09:00:00', '2026-07-18 09:00:00', 'Send a thank-you note to Diego', '2026-07-29', NULL, NULL, 4, NULL, NULL, NULL, 'seed-admin'),
  (9005, 9006, 9007, 'Platform Engineer (client via agency)', 'platform-engineer', NULL, 'agency', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'applied', 'Ingrid couldn''t share the end client name yet.', '2026-07-08', '2026-07-06 09:00:00', '2026-07-08 09:00:00', 'Ask Ingrid for the client name and JD', '2026-08-04', NULL, NULL, NULL, NULL, NULL, NULL, 'seed-admin'),
  (9006, 9001, NULL, 'Cloud Infrastructure Lead', 'devops', 'https://northwindcloud.example/careers/cloud-infrastructure-lead', 'job board', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'interested', 'Saw this on LinkedIn — need to tailor the CV before applying.', NULL, '2026-07-27 09:00:00', '2026-07-27 09:00:00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed-admin'),
  (9007, 9002, NULL, 'Senior Frontend Engineer', 'front-end', 'https://lumenrobotics.example/careers/senior-frontend-engineer', 'job board', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'interested', NULL, NULL, '2026-07-25 09:00:00', '2026-07-25 09:00:00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed-admin'),
  (9008, 9003, NULL, 'Full-stack TypeScript Engineer', 'typescript', 'https://fieldstoneanalytics.example/jobs/full-stack-typescript-engineer', 'job board', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'interested', 'Team looks small but the product is interesting.', NULL, '2026-07-20 09:00:00', '2026-07-20 09:00:00', 'Research the team before applying', '2026-08-06', NULL, NULL, 3, NULL, NULL, NULL, 'seed-admin'),
  (9009, 9005, 9006, 'Platform Reliability Engineer', 'platform-engineer', 'https://solacesystems.example/careers/platform-reliability-engineer', 'job board', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'applied', 'No response in three weeks — probably going quiet.', '2026-07-01', '2026-06-28 09:00:00', '2026-07-01 09:00:00', 'Send a polite follow-up email', '2026-07-20', NULL, NULL, 3, NULL, NULL, NULL, 'seed-admin'),
  (9010, 9004, 9005, 'Infrastructure Engineer', 'devops', NULL, 'agency', '€70,000 – €85,000', 'EUR', 70000, 85000, 'year', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'interview', 'Panel interview went well; onsite scheduled next week.', '2026-06-20', '2026-06-15 09:00:00', '2026-07-24 17:00:00', 'Prepare for the onsite', '2026-08-01', '2026-08-02', NULL, 4, NULL, NULL, NULL, 'seed-admin'),
  (9011, 9002, 9003, 'Senior Site Reliability Engineer', 'devops', 'https://lumenrobotics.example/careers/senior-sre', 'job board', '€90,000 – €100,000', 'EUR', 95000, 95000, 'year', 5000, 10, 20000, '26 vacation days, remote-first, home-office stipend.', NULL, NULL, NULL, 'offer', 'Offer in hand — comparing against the Northwind and Brightpath processes before deciding.', '2026-05-20', '2026-05-15 09:00:00', '2026-07-15 11:05:00', 'Reply to the offer', '2026-07-30', NULL, NULL, 5, NULL, NULL, NULL, 'seed-admin'),
  (9012, 9005, 9006, 'Platform Engineer', 'platform-engineer', NULL, 'job board', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'rejected', 'Passed after the technical screen — team went with someone with more Kafka experience.', '2026-04-10', '2026-04-05 09:00:00', '2026-05-01 09:00:00', NULL, NULL, NULL, NULL, 3, NULL, NULL, NULL, 'seed-admin'),
  (9013, 9006, 9007, 'DevOps Consultant', 'devops', NULL, 'agency', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'rejected', 'Client filled the role internally.', '2026-03-15', '2026-03-10 09:00:00', '2026-04-02 09:00:00', NULL, NULL, NULL, '2026-04-05 10:00:00', 2, NULL, NULL, NULL, 'seed-admin'),
  (9014, 9004, 9005, 'Frontend Contractor', 'front-end', NULL, 'agency', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ghosted', 'Agency stopped responding after the second follow-up.', '2026-03-01', '2026-02-25 09:00:00', '2026-04-10 09:00:00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed-admin'),
  (9015, 9003, 9004, 'Backend TypeScript Engineer', 'typescript', NULL, 'job board', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'withdrawn', 'Withdrew after learning about the on-call rotation during the screen.', '2026-02-15', '2026-02-10 09:00:00', '2026-03-01 09:00:00', NULL, NULL, NULL, NULL, 2, NULL, NULL, NULL, 'seed-admin');

-- --- Application tags ---
INSERT INTO application_tags (application_id, tag_id, sort_order, user_id) VALUES
  (9001, 9501, 0, 'seed-admin'),
  (9004, 9502, 0, 'seed-admin'),
  (9006, 9503, 0, 'seed-admin'),
  (9011, 9501, 0, 'seed-admin');

-- --- Interactions (Track tab timeline; a couple attach to a contact only) ---
INSERT INTO interactions (id, application_id, contact_id, type, happened_at, notes, interviewers, created_at, user_id) VALUES
  (9101, 9001, NULL, 'email', '2026-06-10',
    'Applied via the company site; tailored the CV toward platform reliability work.',
    NULL, '2026-06-10 09:15:00', 'seed-admin'),
  (9102, 9001, NULL, 'call', '2026-06-18',
    '30-minute recruiter screen with Tomasz — talked through comp expectations and team structure.',
    NULL, '2026-06-18 15:00:00', 'seed-admin'),
  (9103, 9001, NULL, 'interview', '2026-06-25',
    'Round 1 with the hiring manager — system design on a multi-tenant deploy pipeline. Went well.',
    'Mira Doyle (EM), Jonas Kade (Staff SRE)', '2026-06-25 17:30:00', 'seed-admin'),
  (9104, 9001, NULL, 'email', '2026-07-08',
    'Sent over the architecture diagram they asked for after round 1.',
    NULL, '2026-07-08 10:00:00', 'seed-admin'),
  (9105, 9001, NULL, 'interview', '2026-07-24',
    'Round 2 — pairing exercise plus Q&A with two platform engineers.',
    'Jonas Kade, Priya Novak', '2026-07-24 16:45:00', 'seed-admin'),
  (9106, 9011, NULL, 'interview', '2026-06-05',
    'Onsite loop — four rounds, all positive signals from the debrief.',
    NULL, '2026-06-05 18:00:00', 'seed-admin'),
  (9107, 9011, NULL, 'email', '2026-07-15',
    'Offer received — reviewing the comp package before responding.',
    NULL, '2026-07-15 11:00:00', 'seed-admin'),
  (9108, 9010, NULL, 'call', '2026-07-10',
    'Recruiter call with Sanne to schedule the onsite.',
    NULL, '2026-07-10 13:00:00', 'seed-admin'),
  (9109, 9010, NULL, 'interview', '2026-07-24',
    'Panel interview — two engineers plus the hiring manager.',
    'Diego Fontaine, plus two engineers from the platform team', '2026-07-24 17:00:00', 'seed-admin'),
  (9110, NULL, 9002, 'message', '2026-07-18',
    'LinkedIn message asking about timeline for the Northwind recruiter screen.',
    NULL, '2026-07-18 09:30:00', 'seed-admin');

-- --- Status history (application-layer normally records this; since this
-- script writes rows directly there's no INSERT trigger to rely on, see
-- migration 0010's note on why the DB-level trigger was removed) ---
INSERT INTO status_history (id, application_id, from_status, to_status, changed_at, user_id) VALUES
  (9201, 9001, NULL, 'interested', '2026-06-08 09:00:00', 'seed-admin'),
  (9202, 9001, 'interested', 'applied', '2026-06-15 09:00:00', 'seed-admin'),
  (9203, 9001, 'applied', 'screening', '2026-06-18 15:05:00', 'seed-admin'),
  (9204, 9001, 'screening', 'interview', '2026-06-25 17:35:00', 'seed-admin'),

  (9205, 9002, NULL, 'interested', '2026-06-28 09:00:00', 'seed-admin'),
  (9206, 9002, 'interested', 'applied', '2026-07-05 09:00:00', 'seed-admin'),
  (9207, 9002, 'applied', 'screening', '2026-07-12 09:00:00', 'seed-admin'),

  (9208, 9003, NULL, 'interested', '2026-07-08 09:00:00', 'seed-admin'),
  (9209, 9003, 'interested', 'applied', '2026-07-10 09:00:00', 'seed-admin'),
  (9210, 9003, 'applied', 'screening', '2026-07-16 09:00:00', 'seed-admin'),

  (9211, 9004, NULL, 'interested', '2026-07-16 09:00:00', 'seed-admin'),
  (9212, 9004, 'interested', 'applied', '2026-07-18 09:00:00', 'seed-admin'),

  (9213, 9005, NULL, 'interested', '2026-07-06 09:00:00', 'seed-admin'),
  (9214, 9005, 'interested', 'applied', '2026-07-08 09:00:00', 'seed-admin'),

  (9215, 9006, NULL, 'interested', '2026-07-27 09:00:00', 'seed-admin'),

  (9216, 9007, NULL, 'interested', '2026-07-25 09:00:00', 'seed-admin'),

  (9217, 9008, NULL, 'interested', '2026-07-20 09:00:00', 'seed-admin'),

  (9218, 9009, NULL, 'interested', '2026-06-28 09:00:00', 'seed-admin'),
  (9219, 9009, 'interested', 'applied', '2026-07-01 09:00:00', 'seed-admin'),

  (9220, 9010, NULL, 'interested', '2026-06-15 09:00:00', 'seed-admin'),
  (9221, 9010, 'interested', 'applied', '2026-06-20 09:00:00', 'seed-admin'),
  (9222, 9010, 'applied', 'screening', '2026-06-28 09:00:00', 'seed-admin'),
  (9223, 9010, 'screening', 'interview', '2026-07-10 13:05:00', 'seed-admin'),

  (9224, 9011, NULL, 'interested', '2026-05-15 09:00:00', 'seed-admin'),
  (9225, 9011, 'interested', 'applied', '2026-05-20 09:00:00', 'seed-admin'),
  (9226, 9011, 'applied', 'screening', '2026-05-28 09:00:00', 'seed-admin'),
  (9227, 9011, 'screening', 'interview', '2026-06-05 09:00:00', 'seed-admin'),
  (9228, 9011, 'interview', 'offer', '2026-07-15 11:05:00', 'seed-admin'),

  (9229, 9012, NULL, 'interested', '2026-04-05 09:00:00', 'seed-admin'),
  (9230, 9012, 'interested', 'applied', '2026-04-10 09:00:00', 'seed-admin'),
  (9231, 9012, 'applied', 'screening', '2026-04-15 09:00:00', 'seed-admin'),
  (9232, 9012, 'screening', 'rejected', '2026-05-01 09:00:00', 'seed-admin'),

  (9233, 9013, NULL, 'interested', '2026-03-10 09:00:00', 'seed-admin'),
  (9234, 9013, 'interested', 'applied', '2026-03-15 09:00:00', 'seed-admin'),
  (9235, 9013, 'applied', 'rejected', '2026-04-02 09:00:00', 'seed-admin'),

  (9236, 9014, NULL, 'interested', '2026-02-25 09:00:00', 'seed-admin'),
  (9237, 9014, 'interested', 'applied', '2026-03-01 09:00:00', 'seed-admin'),
  (9238, 9014, 'applied', 'ghosted', '2026-04-10 09:00:00', 'seed-admin'),

  (9239, 9015, NULL, 'interested', '2026-02-10 09:00:00', 'seed-admin'),
  (9240, 9015, 'interested', 'applied', '2026-02-15 09:00:00', 'seed-admin'),
  (9241, 9015, 'applied', 'screening', '2026-02-20 09:00:00', 'seed-admin'),
  (9242, 9015, 'screening', 'withdrawn', '2026-03-01 09:00:00', 'seed-admin');

-- --- Documents (Track tab; keys are demo placeholders, not real R2 objects) ---
INSERT INTO documents (id, application_id, key, filename, label, size, content_type, created_at, user_id) VALUES
  (9301, 9001, 'demo/seed/cv-northwind-platform-engineer.pdf', 'Jordan_Ellis_CV_Northwind.pdf',
    'Tailored CV', 148230, 'application/pdf', '2026-06-08 09:10:00', 'seed-admin'),
  (9302, 9001, 'demo/seed/cover-letter-northwind.pdf', 'Jordan_Ellis_CoverLetter_Northwind.pdf',
    'Cover letter', 52210, 'application/pdf', '2026-06-08 09:12:00', 'seed-admin'),
  (9303, 9011, 'demo/seed/offer-letter-lumen.pdf', 'Lumen_Robotics_Offer.pdf',
    'Offer letter', 88120, 'application/pdf', '2026-07-15 11:10:00', 'seed-admin');

-- --- Interview prep items (Prep tab) ---
INSERT INTO interview_prep_items (id, application_id, text, done, sort_order, created_at, user_id) VALUES
  (9401, 9001, 'Review system design fundamentals (queueing, caching, sharding)', 1, 0, '2026-06-20 09:00:00', 'seed-admin'),
  (9402, 9001, 'Prepare three STAR stories on cross-team incident response', 1, 1, '2026-06-20 09:05:00', 'seed-admin'),
  (9403, 9001, 'Research Northwind Cloud''s latest funding round and roadmap', 0, 2, '2026-06-22 09:00:00', 'seed-admin'),
  (9404, 9001, 'Prepare questions about the on-call rotation and SRE culture', 0, 3, '2026-06-22 09:05:00', 'seed-admin');

-- --- Feed items (shared pool, not user-scoped — see migration 0024's note) ---
INSERT INTO feed_items (id, source, external_id, title, company, location, url, salary_text, role_type, posted_at, fetched_at, board_slug, description) VALUES
  (9601, 'adzuna', 'demo-adzuna-seed-1', 'Platform Engineer', 'Meridian Cloud', 'Amsterdam, NL',
    'https://example.com/jobs/meridian-platform-engineer', '€70,000 - €85,000', 'platform-engineer',
    '2026-07-27', '2026-07-27 08:00:00', NULL,
    'Own our Kubernetes platform and Terraform-based infrastructure for a Series B logistics startup.'),
  (9602, 'adzuna', 'demo-adzuna-seed-2', 'DevOps Engineer', 'Ridgeline Systems', 'Remote (EU)',
    'https://example.com/jobs/ridgeline-devops-engineer', '€65,000 - €80,000', 'devops',
    '2026-07-26', '2026-07-26 08:00:00', NULL,
    'CI/CD pipelines, AWS, and an on-call rotation for a growing fintech.'),
  (9603, 'adzuna', 'demo-adzuna-seed-3', 'Frontend Engineer (React)', 'Alderly Health', 'Utrecht, NL',
    'https://example.com/jobs/alderly-frontend-engineer', NULL, 'front-end',
    '2026-07-24', '2026-07-24 08:00:00', NULL,
    'Build accessible React interfaces for a clinical scheduling product.'),
  (9604, 'greenhouse', 'demo-gh-seed-1', 'Staff TypeScript Engineer', 'Kestrel Data', 'Remote',
    'https://example.com/jobs/kestrel-staff-typescript-engineer', NULL, 'typescript',
    '2026-07-20', '2026-07-20 08:00:00', NULL,
    'Deep TypeScript backend work, GraphQL, and CI/CD ownership.'),
  (9605, 'adzuna', 'demo-adzuna-seed-4', 'Site Reliability Engineer', 'Palisade Systems', 'Berlin, DE',
    'https://example.com/jobs/palisade-sre', '€80,000 - €95,000', 'devops',
    '2026-07-18', '2026-07-18 08:00:00', NULL,
    'SRE role focused on Kubernetes reliability and incident response.');

-- --- CV builder content (profile, skills, work experience, education, languages) ---
-- A profile row for seed-admin already exists (migration 0024 backfills one
-- from the pre-multi-user singleton), so this fills it in rather than
-- inserting a second row (profile.user_id is UNIQUE).
UPDATE profile SET
  name = 'Jordan Ellis',
  email = 'jordan.ellis@example.com',
  phone = '+31 6 1234 5678',
  location = 'Amsterdam, NL',
  linkedin = 'https://linkedin.com/in/jordanellis-demo',
  github = 'https://github.com/jordanellis-demo',
  portfolio = 'https://jordanellis.example',
  summary = 'Platform-minded full-stack engineer with 8 years building developer tooling and infrastructure. Recently focused on Kubernetes platforms, CI/CD, and TypeScript services.'
WHERE user_id = 'seed-admin';

INSERT INTO skills (id, user_id, name) VALUES
  (9701, 'seed-admin', 'Kubernetes'),
  (9702, 'seed-admin', 'Terraform'),
  (9703, 'seed-admin', 'TypeScript'),
  (9704, 'seed-admin', 'React'),
  (9705, 'seed-admin', 'CI/CD'),
  (9706, 'seed-admin', 'AWS');

INSERT INTO work_experience (id, user_id, company, title, description, start_month, start_year, end_month, end_year, is_current, sort_order) VALUES
  (9801, 'seed-admin', 'Vantage Digital', 'Senior Platform Engineer',
    'Led the migration to Kubernetes and built the internal developer platform, cutting average deploy time by 70%.',
    3, 2021, NULL, NULL, 1, 0),
  (9802, 'seed-admin', 'Beacon Software', 'Full-stack Engineer',
    'Built and maintained a TypeScript/React SaaS product; introduced the team''s first CI/CD pipeline.',
    6, 2017, 2, 2021, 0, 1);

INSERT INTO work_experience_skills (work_experience_id, skill_id, user_id) VALUES
  (9801, 9701, 'seed-admin'),
  (9801, 9702, 'seed-admin'),
  (9801, 9706, 'seed-admin'),
  (9801, 9705, 'seed-admin'),
  (9802, 9703, 'seed-admin'),
  (9802, 9704, 'seed-admin'),
  (9802, 9705, 'seed-admin');

INSERT INTO education (id, user_id, institution, degree, field, start_month, start_year, end_month, end_year, sort_order) VALUES
  (9910, 'seed-admin', 'Utrecht University', 'BSc', 'Computer Science', NULL, 2013, NULL, 2017, 0);

INSERT INTO languages (id, user_id, name, proficiency) VALUES
  (9911, 'seed-admin', 'English', 'fluent'),
  (9912, 'seed-admin', 'Dutch', 'native');

INSERT INTO cv_versions (id, user_id, name, snapshot, created_at) VALUES
  (9920, 'seed-admin', 'Platform-focused',
   '{"profile":{"id":1,"name":"Jordan Ellis","email":"jordan.ellis@example.com","phone":"+31 6 1234 5678","location":"Amsterdam, NL","linkedin":"https://linkedin.com/in/jordanellis-demo","github":"https://github.com/jordanellis-demo","portfolio":"https://jordanellis.example","summary":"Platform-minded full-stack engineer with 8 years building developer tooling and infrastructure.","share_token":null,"calendar_token":null,"api_key":null},"workExperience":[{"id":9801,"company":"Vantage Digital","title":"Senior Platform Engineer","description":"Led the migration to Kubernetes and built the internal developer platform, cutting average deploy time by 70%.","start_month":3,"start_year":2021,"end_month":null,"end_year":null,"is_current":1,"sort_order":0,"skills":[{"id":9701,"name":"Kubernetes"},{"id":9702,"name":"Terraform"}]},{"id":9802,"company":"Beacon Software","title":"Full-stack Engineer","description":"Built and maintained a TypeScript and React SaaS product.","start_month":6,"start_year":2017,"end_month":2,"end_year":2021,"is_current":0,"sort_order":1,"skills":[{"id":9703,"name":"TypeScript"},{"id":9704,"name":"React"}]}],"education":[{"id":9910,"institution":"Utrecht University","degree":"BSc","field":"Computer Science","start_month":null,"start_year":2013,"end_month":null,"end_year":2017,"sort_order":0}],"languages":[{"id":9911,"name":"English","proficiency":"fluent"},{"id":9912,"name":"Dutch","proficiency":"native"}]}',
   '2026-07-20 09:00:00');
