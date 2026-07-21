import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "Core/Chip",
  component: Chip,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Chip>;

// 24x24 line-art icon, currentColor + strokeWidth 2, matching the app's icon
// style — stands in for the remove glyph used on tag/keyword chips.
const RemoveIcon = (
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
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export const Default: Story = {
  render: () => (
    <Chip>
      React
      <button type="button" aria-label="Remove">
        {RemoveIcon}
      </button>
    </Chip>
  ),
};

export const Matched: Story = {
  render: () => (
    <Chip matched>
      TypeScript
      <button type="button" aria-label="Remove">
        {RemoveIcon}
      </button>
    </Chip>
  ),
};
