import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Company } from "../types";
import { QuickAddDialog } from "./QuickAddDialog";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof QuickAddDialog> = {
  title: "Feature/QuickAddDialog",
  component: QuickAddDialog,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof QuickAddDialog>;

// Minimal mock — only the fields the company <select> reads (id/name). The
// rest of Company is unused here but required by the type, so it's filled
// with inert placeholders.
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

// Form fields render unstyled here since they use the shared App.css
// .settings-field/.form utilities, which aren't loaded in Storybook — that's
// expected: this component has no styling of its own to preview.
export const Default: Story = {
  render: () => (
    <QuickAddDialog
      companies={mockCompanies}
      onClose={() => {}}
      onCreated={() => {}}
      onError={() => {}}
    />
  ),
};
