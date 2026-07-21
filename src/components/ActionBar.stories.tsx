import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActionBar } from "./ActionBar";
import { Button } from "./Button";

const meta: Meta<typeof ActionBar> = {
  title: "Core/ActionBar",
  component: ActionBar,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ActionBar>;

export const Form: Story = {
  render: () => (
    <ActionBar variant="form">
      <Button variant="primary">Save</Button>
      <Button variant="secondary">Cancel</Button>
    </ActionBar>
  ),
};

export const Detail: Story = {
  render: () => (
    <ActionBar variant="detail">
      <Button variant="secondary">Edit</Button>
      <Button variant="secondary">Archive</Button>
      <Button variant="danger">Delete</Button>
    </ActionBar>
  ),
};

export const Share: Story = {
  render: () => (
    <ActionBar variant="share">
      <Button variant="secondary">Copy link</Button>
      <Button variant="danger">Revoke</Button>
    </ActionBar>
  ),
};
