import type { Meta, StoryObj } from "@storybook/react-vite";
import { FieldLabel } from "./FieldLabel";

const meta: Meta<typeof FieldLabel> = {
  title: "Core/FieldLabel",
  component: FieldLabel,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof FieldLabel>;

export const AboveValue: Story = {
  render: () => (
    <div>
      <FieldLabel>Status</FieldLabel>
      <div>Interview scheduled</div>
    </div>
  ),
};
