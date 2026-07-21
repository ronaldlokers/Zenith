import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatLine } from "./StatLine";

const meta: Meta<typeof StatLine> = {
  title: "Core/StatLine",
  component: StatLine,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof StatLine>;

// The dashboard stacks these in a card; the container owns only layout, so a
// stack here stands in for that context — note the hairline border between
// rows and none above the first.
export const Stack: Story = {
  render: () => (
    <div style={{ maxWidth: "260px" }}>
      <StatLine label="Applications sent" value="12" />
      <StatLine label="Responses" value="6" />
      <StatLine label="Interviews" value="3" />
    </div>
  ),
};
