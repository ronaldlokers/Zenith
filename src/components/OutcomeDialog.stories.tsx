import type { Meta, StoryObj } from "@storybook/react-vite";
import { OutcomeDialog } from "./OutcomeDialog";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof OutcomeDialog> = {
  title: "Feature/OutcomeDialog",
  component: OutcomeDialog,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof OutcomeDialog>;

export const Rejected: Story = {
  render: () => (
    <OutcomeDialog status="rejected" onSave={() => {}} onClose={() => {}} />
  ),
};

// Each terminal status gets its own list, so all three are worth seeing.
export const Withdrawn: Story = {
  render: () => (
    <OutcomeDialog status="withdrawn" onSave={() => {}} onClose={() => {}} />
  ),
};

export const Ghosted: Story = {
  render: () => (
    <OutcomeDialog status="ghosted" onSave={() => {}} onClose={() => {}} />
  ),
};

// The detail-page path: reopened on an outcome already recorded.
export const Prefilled: Story = {
  render: () => (
    <OutcomeDialog
      status="rejected"
      initialReason="after_interview"
      initialNote="Went with an internal candidate."
      onSave={() => {}}
      onClose={() => {}}
    />
  ),
};
