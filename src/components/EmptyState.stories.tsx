import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  title: "Feedback/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

// 24x24 line-art icon, currentColor + strokeWidth 2, matching the app's icon
// style (a box glyph — stands in for any empty-state icon).
const BoxIcon = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 8l9-5 9 5-9 5-9-5z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </svg>
);

export const TextOnly: Story = {
  render: () => <EmptyState>No applications yet.</EmptyState>,
};

export const WithIcon: Story = {
  render: () => (
    <EmptyState>
      {BoxIcon}
      No applications yet.
    </EmptyState>
  ),
};

// A results list renders its empty placeholder as a <li>, since it lives
// inside a <ul> alongside the (absent) result rows.
export const AsListItem: Story = {
  render: () => (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      <EmptyState as="li">{BoxIcon}Nothing matches your filters.</EmptyState>
    </ul>
  ),
};
