import type { Meta, StoryObj } from "@storybook/react-vite";
import { today } from "../format";
import type { AgendaEntry } from "../types";
import { CalendarMonth } from "./CalendarMonth";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof CalendarMonth> = {
  title: "Feature/CalendarMonth",
  component: CalendarMonth,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof CalendarMonth>;

// Minimal mock — only the fields CalendarMonth reads (kind/date drive
// placement and colour; title/company_name/contact_name/label/type feed the
// chip label and tooltip text). Anchored on today() so the grid always shows
// at least one event in the default (current-month) view.
const mockEntries: AgendaEntry[] = [
  {
    kind: "applied",
    id: 1,
    date: `${today()}T00:00:00.000Z`,
    title: "Staff Engineer",
    company_name: "Acme Corp",
    contact_name: null,
  },
  {
    kind: "due",
    id: 2,
    date: `${today()}T00:00:00.000Z`,
    title: "Platform Engineer",
    company_name: "Globex",
    contact_name: null,
    label: "Follow up",
  },
  {
    kind: "interaction",
    id: 3,
    date: `${today()}T00:00:00.000Z`,
    title: "Backend Engineer",
    company_name: "Initech",
    contact_name: "Jordan Lee",
    type: "call",
  },
];

export const Default: Story = {
  render: () => <CalendarMonth entries={mockEntries} onJump={() => {}} />,
};
