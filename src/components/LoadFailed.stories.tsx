import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadFailed } from "./LoadFailed";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof LoadFailed> = {
  title: "Core/LoadFailed",
  component: LoadFailed,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof LoadFailed>;

// What a tab shows in place of its content once the fetch has failed for
// good — the caption plus a way back.
export const WithRetry: Story = {
  render: () => (
    <div style={{ maxWidth: "560px" }}>
      <LoadFailed onRetry={() => {}} />
    </div>
  ),
};

// Without onRetry the caption stands alone: used where the caller has no
// re-fetch to offer.
export const CaptionOnly: Story = {
  render: () => (
    <div style={{ maxWidth: "560px" }}>
      <LoadFailed />
    </div>
  ),
};
