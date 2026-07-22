import type { Meta, StoryObj } from "@storybook/react-vite";
import { MomentumBand } from "./MomentumBand";

const meta: Meta<typeof MomentumBand> = {
  title: "Core/MomentumBand",
  component: MomentumBand,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof MomentumBand>;

export const Default: Story = {
  args: {
    eyebrow: "Momentum",
    verdict: "Picking up",
    detail: "6 applications this week vs 3 the week before",
    bars: [
      { heightPct: 20, dim: true },
      { heightPct: 40, dim: false },
      { heightPct: 10, dim: true },
      { heightPct: 70, dim: false },
      { heightPct: 55, dim: false },
      { heightPct: 4, dim: true },
      { heightPct: 100, dim: false },
    ],
  },
};
