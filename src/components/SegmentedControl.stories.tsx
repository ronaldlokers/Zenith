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

// The API callers actually use: SegmentedControl.Item owns the active class
// and aria-pressed together, so the two states shown here always agree.
function ItemToggle() {
  const [view, setView] = useState<"list" | "grid">("list");
  return (
    <SegmentedControl role="group" aria-label="View">
      <SegmentedControl.Item active={view === "list"} onClick={() => setView("list")}>
        List
      </SegmentedControl.Item>
      <SegmentedControl.Item active={view === "grid"} onClick={() => setView("grid")}>
        Grid
      </SegmentedControl.Item>
    </SegmentedControl>
  );
}

export const Item: Story = {
  render: () => <ItemToggle />,
};

function ItemFourUp() {
  const [n, setN] = useState(0);
  return (
    <SegmentedControl role="group" aria-label="Minimum fit">
      {[0, 1, 2, 3].map((value) => (
        <SegmentedControl.Item key={value} active={n === value} onClick={() => setN(value)}>
          {value === 0 ? "Any" : `${value}+`}
        </SegmentedControl.Item>
      ))}
    </SegmentedControl>
  );
}

export const ItemFourItems: Story = {
  render: () => <ItemFourUp />,
};
