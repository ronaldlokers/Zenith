import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row } from "./Row";

const meta: Meta<typeof Row> = {
  title: "Core/Row",
  component: Row,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Row>;

export const Rows: Story = {
  render: () => (
    <ul
      style={{
        maxWidth: 420,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        listStyle: "none",
        padding: 0,
      }}
    >
      <Row>
        <div className="l1">
          <strong>Acme Corp</strong>
          <span className="co">Amsterdam</span>
        </div>
        <div className="l2">
          <span className="co">Recruiter: Jane Doe</span>
          <span className="due">Next contact: 3 Aug</span>
        </div>
      </Row>
      <Row>
        <div className="l1">
          <strong>Globex</strong>
          <span className="co">Remote</span>
        </div>
        <div className="l2">
          <span className="co">Hiring manager: Sam Lee</span>
          <span className="due">Follow up overdue</span>
        </div>
      </Row>
    </ul>
  ),
};
