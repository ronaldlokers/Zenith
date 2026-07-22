import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Application } from "../types";
import { CoverLetterSection } from "./CoverLetterSection";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof CoverLetterSection> = {
  title: "Feature/CoverLetterSection",
  component: CoverLetterSection,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof CoverLetterSection>;

// Minimal mock — only the fields CoverLetterSection reads (id/title/
// company_name/cover_letter). The rest of Application is unused by this
// component but required by the type, so it's filled with inert
// placeholders.
const mockApplication: Application = {
  id: 1,
  company_id: null,
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
};

export const Default: Story = {
  render: () => (
    <CoverLetterSection
      application={mockApplication}
      onChanged={() => Promise.resolve()}
      onError={() => {}}
      notify={() => {}}
    />
  ),
};

export const WithDraft: Story = {
  render: () => (
    <CoverLetterSection
      application={{
        ...mockApplication,
        cover_letter: "Dear hiring manager,\n\nI'm excited to apply...",
      }}
      onChanged={() => Promise.resolve()}
      onError={() => {}}
      notify={() => {}}
    />
  ),
};
