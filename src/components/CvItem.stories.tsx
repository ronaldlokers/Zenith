import type { Meta, StoryObj } from "@storybook/react-vite";
import { CvItem } from "./CvItem";

const meta: Meta<typeof CvItem> = {
  title: "Core/CvItem",
  component: CvItem,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof CvItem>;

export const Default: Story = {
  render: () => (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: "28rem" }}>
      <CvItem>
        <div className="cv-item-head">
          <div>
            <strong>Senior Frontend Engineer</strong>
            <div>Acme Corp &middot; 2021 &ndash; 2024</div>
          </div>
          <div className="cv-item-actions">
            <button type="button">Edit</button>
            <button type="button" disabled>
              Delete
            </button>
          </div>
        </div>
      </CvItem>
    </ul>
  ),
};
