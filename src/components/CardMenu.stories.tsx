import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Application } from "../types";
import { CardMenu } from "./CardMenu";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys — CardMenu is the first owned component to use useTranslation.
import "../i18n";

const meta: Meta<typeof CardMenu> = {
  title: "Feature/CardMenu",
  component: CardMenu,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof CardMenu>;

// Minimal mock — only the fields CardMenu reads (id/title/status for the
// trigger label + move-stage list, next_action/next_action_at for the
// follow-up form's initial values). The rest of Application is unused by
// this component but required by the type, so it's filled with inert
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
  next_action: "Prep system design round",
  next_action_at: "2026-08-01",
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
    <div style={{ position: "relative", width: "12rem", height: "3rem" }}>
      <CardMenu
        a={mockApplication}
        onMove={() => {}}
        onSetFollowUp={() => {}}
        onOpenDetail={() => {}}
        onArchive={() => {}}
      />
    </div>
  ),
};
