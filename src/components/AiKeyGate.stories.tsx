import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { AiStatusContext } from "../ai-status-context";
import { AiKeyGate } from "./AiKeyGate";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof AiKeyGate> = {
  title: "AI/AiKeyGate",
  component: AiKeyGate,
  tags: ["autodocs"],
  // AiKeyGate links to Account settings, which needs a router context, and
  // reads BYO-key status from context rather than props.
  decorators: [
    (Story) => (
      <MemoryRouter>
        <AiStatusContext.Provider
          value={{ configured: false, hint: null, loading: false, refresh: () => {} }}
        >
          <Story />
        </AiStatusContext.Provider>
      </MemoryRouter>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof AiKeyGate>;

// The only state worth capturing: no key configured, so the gate prompt
// shows instead of the children. Once a key is configured the gate renders
// its children directly — nothing of its own to preview.
export const NoKeyConfigured: Story = {
  render: () => (
    <AiKeyGate>
      <p>Gated content</p>
    </AiKeyGate>
  ),
};
