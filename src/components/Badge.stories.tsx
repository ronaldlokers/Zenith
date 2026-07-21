import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Core/Badge",
  component: Badge,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <Badge>Agency</Badge>
      <Badge variant="warn">Overdue</Badge>
      {/* stage reads --sc from a .stage-* ancestor; supplied inline here. */}
      <span style={{ "--sc": "var(--st-interview)" } as CSSProperties}>
        <Badge variant="stage">Interview</Badge>
      </span>
    </div>
  ),
};
