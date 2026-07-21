import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  // Nests under the "Core" catalog group beside the DS-bundle stories, which
  // is where a browsing user looks for Button. The bundle's monolithic
  // Core.stories.jsx still ships its own flat Button entries during migration;
  // this owned story is the authoritative one and takes over the slot when the
  // bundle stories are repointed at src/ (see .storybook/main.js).
  title: "Core/Button",
  component: Button,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Button>;

// 24x24 line-art icon, currentColor + strokeWidth 2, matching the app's icon
// style (a plus glyph — stands in for any leading icon).
const PlusIcon = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="dark">Dark</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="link">Link</Button>
      <Button variant="close" aria-label="Close">
        ×
      </Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
      <Button variant="primary" icon={PlusIcon}>
        Add
      </Button>
      <Button variant="default" icon={PlusIcon}>
        Add
      </Button>
      <Button variant="ghost" icon={PlusIcon}>
        Add
      </Button>
    </div>
  ),
};
