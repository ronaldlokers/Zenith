import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatCard } from "./StatCard";

const meta: Meta<typeof StatCard> = {
  title: "Core/StatCard",
  component: StatCard,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof StatCard>;

export const Static: Story = {
  render: () => <StatCard value="~34d" label="Time to offer" />,
};

export const Clickable: Story = {
  render: () => (
    <StatCard value="12" label="Open applications" onClick={() => {}} />
  ),
};

// The dashboard renders them in a grid; the container owns only layout, so a
// row here stands in for that context.
export const Row: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
      <StatCard value="12" label="Open applications" onClick={() => {}} />
      <StatCard value="48%" label="Response rate (12/25)" onClick={() => {}} />
      <StatCard value="3" label="Live offers · ~€ 92,000" onClick={() => {}} />
      <StatCard value="~34d" label="Time to offer" />
    </div>
  ),
};
