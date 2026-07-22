import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Application, Company, Contact } from "../types";
import { CommandPalette } from "./CommandPalette";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof CommandPalette> = {
  title: "Feature/CommandPalette",
  component: CommandPalette,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof CommandPalette>;

// Minimal mock — only the fields CommandPalette reads (title/company_name
// for applications, name for companies, name/company_name for contacts).
// The rest of each type is unused by this component but required by the
// type, so it's filled with inert placeholders.
const mockApplications: Application[] = [
  {
    id: 1,
    company_id: 1,
    company_name: "Acme Corp",
    contact_id: null,
    contact_name: null,
    title: "Staff Engineer",
    role_type: "engineering",
    url: null,
    source: null,
    salary_range: null,
    salary_currency: null,
    salary_min: null,
    salary_max: null,
    salary_period: null,
    signing_bonus: null,
    bonus_target_pct: null,
    equity_value: null,
    benefits_notes: null,
    referred_by_contact_id: null,
    posting_status: null,
    posting_checked_at: null,
    status: "interview",
    notes: null,
    applied_at: null,
    next_action: null,
    next_action_at: null,
    deadline_at: null,
    archived_at: null,
    fit_score: null,
    cover_letter: null,
    job_description: null,
    job_description_captured_at: null,
    tags: [],
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  },
];

const mockCompanies: Company[] = [
  {
    id: 1,
    name: "Acme Corp",
    website: null,
    location: null,
    is_agency: 0,
    notes: null,
    description: null,
    logo_url: null,
    researched_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
  },
];

const mockContacts: Contact[] = [
  {
    id: 1,
    company_id: 1,
    company_name: "Acme Corp",
    name: "Jordan Lee",
    role: "Recruiter",
    email: null,
    phone: null,
    linkedin: null,
    notes: null,
    last_contacted_at: null,
    follow_up_at: null,
    outreach_status: "not_contacted",
    created_at: "2026-07-01T00:00:00.000Z",
  },
];

export const Default: Story = {
  render: () => (
    <CommandPalette
      applications={mockApplications}
      companies={mockCompanies}
      contacts={mockContacts}
      onClose={() => {}}
      onJumpToApplication={() => {}}
      onJumpToCompany={() => {}}
      onJumpToContact={() => {}}
      actions={[{ id: "add-job", label: "Add a job", run: () => {} }]}
    />
  ),
};
