import type { Meta, StoryObj } from "@storybook/react-vite";
import { Documents } from "./Documents";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof Documents> = {
  title: "Feature/Documents",
  component: Documents,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Documents>;

// Documents fetches its list from the API on mount; in Storybook that
// request has nothing to talk to and fails silently (caught by onError),
// so this preview shows the upload form with an empty list — the same
// state a fresh, document-less application renders in the real app.
export const Default: Story = {
  render: () => <Documents applicationId={1} onError={() => {}} />,
};
