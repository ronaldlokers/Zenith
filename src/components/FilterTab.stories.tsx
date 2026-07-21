import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FilterTab } from "./FilterTab";

const meta: Meta<typeof FilterTab> = {
  title: "Core/FilterTab",
  component: FilterTab,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof FilterTab>;

// A named component so the interactive story can use hooks (the story `render`
// arrow itself is not a component, so hooks can't live there).
function FilterTabRow() {
  const tabs = [
    { key: "all", label: "All", n: 12 },
    { key: "rejected", label: "Rejected", n: 7 },
    { key: "ghosted", label: "Ghosted", n: 4 },
    { key: "withdrawn", label: "Withdrawn", n: 1 },
  ];
  const [active, setActive] = useState("all");
  return (
    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
      {tabs.map((tab) => (
        <FilterTab
          key={tab.key}
          active={active === tab.key}
          count={tab.n}
          onClick={() => setActive(tab.key)}
        >
          {tab.label}
        </FilterTab>
      ))}
    </div>
  );
}

export const Row: Story = {
  render: () => <FilterTabRow />,
};
