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

export const ROLE_TYPES = [
  "devops",
  "platform-engineer",
  "front-end",
  "typescript",
  "other",
] as const;

export type RoleType = (typeof ROLE_TYPES)[number];

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
}

export interface Stats {
  applications: StatsApplication[];
  history: StatusHistoryRow[];
}

export interface FeedItem {
  id: number;
  source: "adzuna" | "hn" | "arbeitnow";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  salary_text: string | null;
  role_type: RoleType;
  posted_at: string | null;
  fetched_at: string;
  status: "new" | "added" | "dismissed";
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
}

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
  created_at: string;
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
  status: Status;
  notes: string | null;
  applied_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  created_at: string;
  updated_at: string;
}
