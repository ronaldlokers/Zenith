import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TabBar } from "./TabBar";

const meta: Meta<typeof TabBar> = {
  title: "Navigation/TabBar",
  component: TabBar,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof TabBar>;

const TABS = [
  { key: "track", label: "Track" },
  { key: "prep", label: "Prep" },
  { key: "tailor", label: "Tailor" },
];

// useState lives in a named component (not directly in the story render
// arrow) so this doesn't trip the react-hooks lint rule.
function FirstActiveDemo() {
  const [active, setActive] = useState("track");
  return (
    <TabBar
      tabs={TABS}
      active={active}
      onSelect={setActive}
      idPrefix="detail"
      aria-label="Sections"
    />
  );
}

// The application detail view's three sections, first tab active — the
// default state on opening a job.
export const FirstActive: Story = {
  render: () => <FirstActiveDemo />,
};

function MiddleActiveDemo() {
  const [active, setActive] = useState("prep");
  return (
    <TabBar
      tabs={TABS}
      active={active}
      onSelect={setActive}
      idPrefix="detail"
      aria-label="Sections"
    />
  );
}

// A middle tab active, showing the underline can land anywhere in the row,
// not just at the edges.
export const MiddleActive: Story = {
  render: () => <MiddleActiveDemo />,
};
