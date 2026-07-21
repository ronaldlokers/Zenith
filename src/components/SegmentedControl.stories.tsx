import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SegmentedControl } from "./SegmentedControl";

const meta: Meta<typeof SegmentedControl> = {
  title: "Core/SegmentedControl",
  component: SegmentedControl,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof SegmentedControl>;

// useState lives in a named component (not directly in the story render
// arrow) so this doesn't trip the react-hooks lint rule.
function ListGridToggle() {
  const [view, setView] = useState<"list" | "grid">("list");
  return (
    <SegmentedControl role="group" aria-label="View">
      <button
        className={view === "list" ? "active" : ""}
        onClick={() => setView("list")}
      >
        List
      </button>
      <button
        className={view === "grid" ? "active" : ""}
        onClick={() => setView("grid")}
      >
        Grid
      </button>
    </SegmentedControl>
  );
}

export const ListGrid: Story = {
  render: () => <ListGridToggle />,
};
