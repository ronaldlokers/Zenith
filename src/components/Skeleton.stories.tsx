import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Core/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

// What every tab shows while its first fetch is in flight: three shimmering
// card outlines at the height of a job row.
export const Default: Story = {
  render: () => (
    <div style={{ maxWidth: "560px" }}>
      <Skeleton />
    </div>
  ),
};

// The count is adjustable for a list that is known to be longer or shorter
// than the default three.
export const SixCards: Story = {
  render: () => (
    <div style={{ maxWidth: "560px" }}>
      <Skeleton count={6} />
    </div>
  ),
};
