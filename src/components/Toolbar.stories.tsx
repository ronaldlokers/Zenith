import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toolbar } from "./Toolbar";
import { Button } from "./Button";

const meta: Meta<typeof Toolbar> = {
  title: "Core/Toolbar",
  component: Toolbar,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Toolbar>;

export const SearchAndAction: Story = {
  render: () => (
    <Toolbar>
      <input type="search" className="search" placeholder="Search…" />
      <Button variant="primary">Add</Button>
    </Toolbar>
  ),
};
