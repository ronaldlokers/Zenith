import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { SideList } from "./SideList";

const meta: Meta<typeof SideList> = {
  title: "Core/SideList",
  component: SideList,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof SideList>;

export const Rows: Story = {
  render: () => (
    <div style={{ maxWidth: 320 }}>
      <SideList>
        {/* stage reads --sc from a .stage-* ancestor; supplied inline here. */}
        <li style={{ "--sc": "var(--st-interview)" } as CSSProperties}>
          <span className="side-date">2d</span>
          <span className="side-title">Acme Corp</span>
          <span className="side-co">Interview</span>
        </li>
        <li style={{ "--sc": "var(--st-applied)" } as CSSProperties}>
          <span className="side-date">5d</span>
          <span className="side-title">Globex</span>
          <span className="side-co">Applied</span>
        </li>
        {/* no stage class: falls back to the neutral --border colour. */}
        <li>
          <span className="side-title">Work experience</span>
          <span className="side-co">3</span>
        </li>
      </SideList>
    </div>
  ),
};
