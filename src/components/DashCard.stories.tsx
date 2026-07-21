import type { Meta, StoryObj } from "@storybook/react-vite";
import { DashCard } from "./DashCard";

const meta: Meta<typeof DashCard> = {
  title: "Core/DashCard",
  component: DashCard,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof DashCard>;

export const Static: Story = {
  render: () => (
    <DashCard heading="This fortnight" win="2wk">
      <p style={{ margin: 0 }}>Body content goes here.</p>
    </DashCard>
  ),
};

export const Clickable: Story = {
  render: () => (
    <DashCard heading="Funnel" win="live · all-time" onClick={() => {}}>
      <p style={{ margin: 0 }}>Navigates on click.</p>
    </DashCard>
  ),
};

export const Lead: Story = {
  render: () => (
    <DashCard lead>
      <p style={{ margin: 0 }}>Accent left border, no heading.</p>
    </DashCard>
  ),
};

export const HeadingOnly: Story = {
  render: () => (
    <DashCard heading="Recently updated">
      <p style={{ margin: 0 }}>No win pill.</p>
    </DashCard>
  ),
};
