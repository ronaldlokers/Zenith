import type { Meta, StoryObj } from "@storybook/react-vite";
import { RowMenu } from "./RowMenu";

const meta: Meta<typeof RowMenu> = {
  title: "Core/RowMenu",
  component: RowMenu,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof RowMenu>;

const noop = () => {};

export const Default: Story = {
  args: {
    label: "Actions for Staff Engineer",
    items: [
      { label: "Move up", onSelect: noop },
      { label: "Move down", onSelect: noop },
      { label: "Edit", onSelect: noop },
      { label: "Delete", onSelect: noop, danger: true },
    ],
  },
};

// First row of a list: "Move up" has nowhere to go.
export const WithDisabledItem: Story = {
  args: {
    label: "Actions for Staff Engineer",
    items: [
      { label: "Move up", onSelect: noop, disabled: true },
      { label: "Move down", onSelect: noop },
      { label: "Edit", onSelect: noop },
      { label: "Delete", onSelect: noop, danger: true },
    ],
  },
};
