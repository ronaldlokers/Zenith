import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Application, Company, Contact, RoleTypeDef } from "../types";
import { ApplicationForm } from "./ApplicationForm";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof ApplicationForm> = {
  title: "Feature/ApplicationForm",
  component: ApplicationForm,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ApplicationForm>;

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
    name: "Jamie Rivera",
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

const mockRoleTypes: RoleTypeDef[] = [
  { id: 1, slug: "engineering", label: "Engineering", sort_order: 0 },
  { id: 2, slug: "other", label: "Other", sort_order: 1 },
];

const mockApplication: Application = {
  id: 1,
  company_id: 1,
  company_name: "Acme Corp",
  contact_id: null,
  contact_name: null,
  title: "Staff Engineer",
  role_type: "engineering",
  url: "https://example.com/jobs/1",
  source: "referral",
  salary_range: "€90k–€110k",
  salary_currency: "EUR",
  salary_min: 90000,
  salary_max: 110000,
  salary_period: "year",
  signing_bonus: null,
  bonus_target_pct: null,
  equity_value: null,
  benefits_notes: null,
  referred_by_contact_id: null,
  posting_status: null,
  posting_checked_at: null,
  status: "interview",
  notes: null,
  applied_at: "2026-06-01",
  next_action: null,
  next_action_at: null,
  deadline_at: null,
  archived_at: null,
  fit_score: null,
  cover_letter: null,
  job_description: null,
  job_description_captured_at: null,
  tags: [],
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
};

// Form fields render unstyled here since they use the shared App.css
// .form/.form-group utilities, which aren't loaded in Storybook — only the
// url-row (ApplicationForm.css) is self-contained.
export const New: Story = {
  render: () => (
    <ApplicationForm
      initial={null}
      companies={mockCompanies}
      contacts={mockContacts}
      roleTypes={mockRoleTypes}
      applications={[]}
      onSubmit={() => {}}
      onCancel={() => {}}
      onError={() => {}}
    />
  ),
};

export const EditExisting: Story = {
  render: () => (
    <ApplicationForm
      initial={mockApplication}
      companies={mockCompanies}
      contacts={mockContacts}
      roleTypes={mockRoleTypes}
      applications={[mockApplication]}
      onSubmit={() => {}}
      onCancel={() => {}}
      onError={() => {}}
    />
  ),
};
