import type { Meta, StoryObj } from "@storybook/react-vite";
import { InterviewPrepSection } from "./InterviewPrepSection";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof InterviewPrepSection> = {
  title: "Feature/InterviewPrepSection",
  component: InterviewPrepSection,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof InterviewPrepSection>;

// InterviewPrepSection renders nothing until its prep-items fetch resolves
// (`if (!items) return null`). In Storybook that request has nothing to
// talk to, so this preview intentionally shows a blank canvas — the same
// state the real app is in for the instant before the list loads.
export const Default: Story = {
  render: () => (
    <InterviewPrepSection applicationId={1} onError={() => {}} />
  ),
};
