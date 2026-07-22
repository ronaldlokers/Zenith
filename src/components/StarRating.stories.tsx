import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { StarRating } from "./StarRating";

const meta: Meta<typeof StarRating> = {
  title: "Core/StarRating",
  component: StarRating,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof StarRating>;

function InteractiveDemo() {
  const [value, setValue] = useState<number | null>(3);
  return (
    <div>
      <p id="fit-label-demo">Fit score</p>
      <StarRating
        value={value}
        onChange={setValue}
        aria-labelledby="fit-label-demo"
        starLabel={(n) => `Set fit score to ${n}`}
      />
    </div>
  );
}

export const Interactive: Story = {
  render: () => <InteractiveDemo />,
};
