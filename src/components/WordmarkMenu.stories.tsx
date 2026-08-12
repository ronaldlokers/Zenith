import type { Meta, StoryObj } from "@storybook/react-vite";
import { WordmarkMenu } from "./WordmarkMenu";
import {
  NavCvIcon,
  NavFeedIcon,
  NavInsightsIcon,
  NavNetworkIcon,
  NavOverviewIcon,
  NavPipelineIcon,
  SettingsIcon,
} from "../icons";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof WordmarkMenu> = {
  title: "Shell/WordmarkMenu",
  component: WordmarkMenu,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof WordmarkMenu>;

const destinations = [
  { id: "overview", label: "Today", shortcut: "1", icon: <NavOverviewIcon />, count: 4, active: true },
  { id: "board", label: "Pipeline", shortcut: "2", icon: <NavPipelineIcon />, count: 15, active: false },
  { id: "feed", label: "Feed", shortcut: "3", icon: <NavFeedIcon />, count: 5, active: false },
  { id: "companies", label: "People & companies", shortcut: "4", icon: <NavNetworkIcon />, active: false },
  { id: "cv", label: "CV", shortcut: "5", icon: <NavCvIcon />, active: false },
  { id: "insights", label: "Insights", shortcut: "6", icon: <NavInsightsIcon />, active: false },
];

const actions = [
  { id: "add", label: "Add an application", shortcut: "C", icon: <span aria-hidden="true">+</span>, active: false },
  { id: "settings", label: "Settings", shortcut: ",", icon: <SettingsIcon />, active: false },
];

export const Default: Story = {
  render: () => (
    <WordmarkMenu
      destinations={destinations}
      actions={actions}
      onSelect={() => {}}
      onClose={() => {}}
    />
  ),
};
