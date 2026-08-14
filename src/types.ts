export const STATUSES = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;

export type Status = (typeof STATUSES)[number];

export const TERMINAL_STATUSES = ["rejected", "withdrawn", "ghosted"] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export function isTerminalStatus(s: string): s is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(s);
}

// Why an application ended (#381), scoped per terminal status: the options
// have to make sense for the move that was just made, or "other" becomes the
// only honest answer. Slugs are stored — the labels live in the locale files
// under `outcome.reason.*`, so rewording never touches data.
//
// worker/index.ts validates a submitted reason against the list for that
// transition's own to_status, and imports this table rather than keeping a
// second copy: a drift between the two would be a silent validation bug.
export const OUTCOME_REASONS: Record<TerminalStatus, readonly string[]> = {
  rejected: [
    "no_response",
    "after_screening",
    "after_interview",
    "role_cancelled",
    "other",
  ],
  withdrawn: [
    "took_other_offer",
    "comp_too_low",
    "role_changed",
    "bad_signal",
    "other",
  ],
  ghosted: ["no_reply_after_applying", "went_quiet_mid_process", "other"],
};

// Role types are configurable (issue #45) — fetched from /api/role-types
// rather than a fixed union, since the list can change without a deploy.
export type RoleType = string;

export interface RoleTypeDef {
  id: number;
  slug: string;
  label: string;
  sort_order: number;
}

export const INTERACTION_TYPES = [
  "email",
  "call",
  "message",
  "interview",
  "meeting",
  "other",
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export interface Interaction {
  id: number;
  application_id: number | null;
  contact_id: number | null;
  type: InteractionType;
  happened_at: string;
  notes: string | null;
  interviewers: string | null;
  created_at: string;
  via_contact?: number;
}

export interface StatsApplication {
  id: number;
  status: Status;
  source: string | null;
  applied_at: string | null;
  created_at: string;
}

export interface StatusHistoryRow {
  application_id: number;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
  // Only ever set on a terminal transition (#381), and absent from the public
  // share page's copy of this payload — the note is free text the user wrote.
  outcome_reason?: string | null;
  outcome_note?: string | null;
}

export interface Stats {
  applications: StatsApplication[];
  history: StatusHistoryRow[];
  interactions: { application_id: number; last_at: string }[];
}

export interface AgendaEntry {
  kind: "due" | "interaction" | "applied";
  id: number;
  date: string;
  title: string | null;
  company_name: string | null;
  label?: string | null;
  type?: string;
  notes?: string | null;
  application_id?: number | null;
  contact_name?: string | null;
}

export interface ActivityEvent {
  kind: "status" | "interaction" | "document";
  application_id: number;
  title: string;
  company_name: string | null;
  from_status: Status | null;
  to_status: Status | null;
  type: InteractionType | null;
  notes: string | null;
  filename: string | null;
  ts: string;
}

export interface FeedItem {
  id: number;
  // "arbeitnow" no longer gets ingested (#165, German-market focused) but
  // stays a valid value here for historical feed_items rows.
  source: "adzuna" | "hn" | "arbeitnow" | "greenhouse" | "ashby";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  salary_text: string | null;
  role_type: RoleType;
  posted_at: string | null;
  fetched_at: string;
  // "saved" is the feed's own third outcome — kept for later, never an
  // application, so it does not touch any pipeline count.
  status: "new" | "added" | "dismissed" | "saved";
  board_slug: string | null;
  // The posting's opening, so the triage pane can show what the job actually
  // says. The FULL description is still not shipped — it is up to 8000 chars
  // a row and is carried into job_description only when the item is added.
  description_snippet?: string | null;
  // How many of the user's CV-backed skills this posting mentions, computed
  // server-side (#446).
  match_count: number;
  // The matched skill names behind match_count (#471) — the "why it fits"
  // reasons shown in the feed detail pane.
  match_skills: string[];
}

// Keyset cursor for paging the feed (#261): sort key (posted_at or "")
// plus the row id as a tiebreaker.
export interface FeedCursor {
  k: string;
  id: number;
}

// Saved views (#277) — a named snapshot of the Jobs tab filter/sort state.
export interface JobFilters {
  query: string;
  statusFilter: string;
  roleFilter: string;
  companyFilter: string;
  tagFilter: string;
  showArchived: boolean;
  sort: string;
}

export interface SavedView {
  id: number;
  name: string;
  filters: JobFilters;
  created_at: string;
}

export interface AtsBoard {
  id: number;
  source: "greenhouse" | "ashby";
  slug: string;
}

export interface ImportResult {
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  source: string;
}

export interface Document {
  id: number;
  application_id: number;
  filename: string;
  label: string | null;
  size: number;
  content_type: string | null;
  created_at: string;
}

export interface Company {
  id: number;
  name: string;
  website: string | null;
  location: string | null;
  is_agency: number;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export type OutreachStatus =
  | "not_contacted"
  | "awaiting_reply"
  | "replied"
  | "no_response";

export interface Contact {
  id: number;
  company_id: number | null;
  company_name?: string | null;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  follow_up_at: string | null;
  outreach_status: OutreachStatus;
  created_at: string;
  updated_at: string | null;
}

export interface Application {
  id: number;
  company_id: number | null;
  company_name?: string | null;
  contact_id: number | null;
  contact_name?: string | null;
  title: string;
  role_type: RoleType;
  url: string | null;
  source: string | null;
  salary_range: string | null;
  salary_currency: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: "year" | "month" | null;
  signing_bonus: number | null;
  bonus_target_pct: number | null;
  equity_value: number | null;
  benefits_notes: string | null;
  referred_by_contact_id: number | null;
  referred_by_name?: string | null;
  posting_status: string | null;
  posting_checked_at: string | null;
  status: Status;
  notes: string | null;
  applied_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  deadline_at: string | null;
  archived_at: string | null;
  // Set when pinned, NULL when not — see migrations/0057_pinned.sql.
  pinned_at: string | null;
  fit_score: number | null;
  cover_letter: string | null;
  job_description: string | null;
  job_description_captured_at: string | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: 1;
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  summary: string | null;
  share_token: string | null;
  calendar_token: string | null;
  // The key itself is never returned — only its digest is stored (#381), so
  // these two are all Settings has to identify an existing key by.
  api_key_hint: string | null;
  api_key_created_at: string | null;
  // Comma-separated board-rail slugs — the eight stages plus "archived"
  // (#535 shell). NULL means never set, so the
  // client applies its default; the empty string means explicitly nothing
  // folded, which is a different thing.
  board_folded: string | null;
  share_show_identity: number;
}

export interface Webhook {
  id: number;
  url: string;
  enabled: boolean | number;
  created_at: string;
  // "blocked" is the delivery-time SSRF re-check refusing the URL — not a
  // receiver failure, and not fixable by retrying or re-enabling.
  last_status: "ok" | "failed" | "blocked" | null;
  last_attempt_at: string | null;
  failure_count: number;
}

export interface Skill {
  id: number;
  name: string;
}

export interface OutreachTemplate {
  id: number;
  name: string;
  body: string;
  sort_order: number;
  created_at: string;
}

export interface UserGoal {
  user_id: string;
  weekly_app_goal: number;
  search_started_at: string | null;
  created_at: string;
}

export interface CvVersion {
  id: number;
  name: string;
  snapshot: string; // JSON string of { profile, workExperience, education, languages }
  created_at: string;
}

export interface CvSnapshotData {
  profile: Profile;
  workExperience: WorkExperience[];
  education: Education[];
  languages: Language[];
}

export interface Tag {
  id: number;
  name: string;
  sort_order?: number;
}

export interface PrepItem {
  id: number;
  application_id: number;
  text: string;
  done: boolean | number;
  sort_order: number;
  created_at: string;
}

export interface JournalEntry {
  id: number;
  text: string;
  created_at: string;
}

export interface AppNotification {
  id: number;
  type:
    | "due_followup"
    | "stale_posting"
    | "feed_match"
    | "due_contact"
    | "weekly_digest"
    | "upcoming_followup"
    | "upcoming_contact";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface WorkExperience {
  id: number;
  company: string;
  title: string;
  description: string | null;
  start_month: number | null;
  start_year: number | null;
  end_month: number | null;
  end_year: number | null;
  is_current: number;
  sort_order: number;
  skills: Skill[];
}

export interface Education {
  id: number;
  institution: string;
  degree: string | null;
  field: string | null;
  start_month: number | null;
  start_year: number | null;
  end_month: number | null;
  end_year: number | null;
  sort_order: number;
}

export interface Language {
  id: number;
  name: string;
  proficiency: "conversational" | "fluent" | "native";
}

export interface TabProps {
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}

export interface CrudTabProps extends TabProps {
  // The third argument names the undo action: most toasts say "Undo", but a
  // view someone landed in says how to get back ("Back to live").
  notify: (message: string, undo?: () => void, label?: string) => void;
  onDelete: (resource: string, id: number, name: string) => void;
}
