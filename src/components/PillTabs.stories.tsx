import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { PillTabs } from "./PillTabs";

const meta: Meta<typeof PillTabs> = {
  title: "Navigation/PillTabs",
  component: PillTabs,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof PillTabs>;

const TABS = [
  { key: "companies", label: "Companies" },
  { key: "contacts", label: "People" },
];

// useState lives in a named component (not directly in the story render
// arrow) so this doesn't trip the react-hooks lint rule.
function CompaniesActiveDemo() {
  const [active, setActive] = useState("companies");
  return <PillTabs tabs={TABS} active={active} onSelect={setActive} aria-label="Network" />;
}

// The network subnav's default state — Companies active, no idPrefix since
// the network view renders no tabpanel.
export const CompaniesActive: Story = {
  render: () => <CompaniesActiveDemo />,
};

function ContactsActiveDemo() {
  const [active, setActive] = useState("contacts");
  return <PillTabs tabs={TABS} active={active} onSelect={setActive} aria-label="Network" />;
}

// The People pill selected, showing the filled-accent active state can land
// on either pill in the capsule.
export const ContactsActive: Story = {
  render: () => <ContactsActiveDemo />,
};
