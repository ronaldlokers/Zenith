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

// A column of cards rather than one card's body: the panel drops its own
// surface, the heading centres, and the icon holds the right edge.
export const Column: Story = {
  render: () => (
    <DashCard column heading="Funnel (26)" icon={<span aria-hidden="true">▲</span>}>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "0.6rem 0.75rem",
        }}
      >
        One of the cards that stack inside the column.
      </div>
    </DashCard>
  ),
};
