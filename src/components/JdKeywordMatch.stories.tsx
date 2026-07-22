import type { Meta, StoryObj } from "@storybook/react-vite";
import { JdKeywordMatch } from "./JdKeywordMatch";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof JdKeywordMatch> = {
  title: "Feature/JdKeywordMatch",
  component: JdKeywordMatch,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof JdKeywordMatch>;

export const Empty: Story = {
  render: () => <JdKeywordMatch onError={() => {}} />,
};

// With initialText set, the component fetches skills/work-experience on
// mount to compute the match — in Storybook that request has nothing to
// talk to and fails silently (caught by onError), so this preview shows
// the textarea pre-filled but without a match result, same as the instant
// before the fetch would resolve in the real app.
export const WithPastedJd: Story = {
  render: () => (
    <JdKeywordMatch
      onError={() => {}}
      initialText="We're looking for a Staff Engineer with strong TypeScript and React experience."
    />
  ),
};
