import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SettingsNav } from "./SettingsNav";

const meta: Meta<typeof SettingsNav> = {
  title: "Navigation/SettingsNav",
  component: SettingsNav,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof SettingsNav>;

const SECTIONS = [
  { key: "general", label: "General" },
  { key: "account", label: "Account" },
  { key: "feed", label: "Feed sources" },
  { key: "sharing", label: "Sharing" },
  { key: "integrations", label: "Integrations" },
  { key: "data", label: "Data" },
];

// useState lives in a named component (not directly in the story render
// arrow) so this doesn't trip the react-hooks lint rule.
function FirstActiveDemo() {
  const [active, setActive] = useState("general");
  return (
    <SettingsNav
      sections={SECTIONS}
      active={active}
      onSelect={setActive}
      aria-label="Settings"
    />
  );
}

// The Settings page's full section list, first section active — the
// default state on opening Settings.
export const FirstActive: Story = {
  render: () => <FirstActiveDemo />,
};

const ADMIN_SECTIONS = [
  { key: "users", label: "Users" },
  { key: "invites", label: "Invites" },
  { key: "demo", label: "Demo data" },
  { key: "notifications", label: "Notifications" },
];

function AdminMiddleActiveDemo() {
  const [active, setActive] = useState("demo");
  return (
    <SettingsNav
      sections={ADMIN_SECTIONS}
      active={active}
      onSelect={setActive}
      aria-label="Admin"
    />
  );
}

// Admin's shorter section list, a middle section active — shows the accent
// spine can land anywhere in the rail, not just at the top.
export const AdminMiddleActive: Story = {
  render: () => <AdminMiddleActiveDemo />,
};
