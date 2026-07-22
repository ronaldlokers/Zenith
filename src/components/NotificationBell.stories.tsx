import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof NotificationBell> = {
  title: "Feature/NotificationBell",
  component: NotificationBell,
  tags: ["autodocs"],
  // NotificationBell calls useNavigate() to jump to a notification's link,
  // which requires a router context even though the story never navigates.
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof NotificationBell>;

// No props — on mount it fetches from /api/notifications, which has no
// backend in Storybook, so it renders with zero unread and an empty panel.
export const Default: Story = {
  render: () => <NotificationBell />,
};
