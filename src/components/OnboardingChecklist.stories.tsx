import type { Meta, StoryObj } from "@storybook/react-vite";
import { OnboardingChecklist } from "./OnboardingChecklist";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys (see CardMenu.stories.tsx for the first owned component to do
// this).
import "../i18n";

const meta: Meta<typeof OnboardingChecklist> = {
  title: "Feature/OnboardingChecklist",
  component: OnboardingChecklist,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof OnboardingChecklist>;

export const Default: Story = {
  render: () => (
    <div style={{ maxWidth: "20rem" }}>
      <OnboardingChecklist
        profileDone={false}
        companyDone={false}
        jobDone={false}
        feedDone={false}
        onGoToProfile={() => {}}
        onGoToCompanies={() => {}}
        onAddJob={() => {}}
        onGoToFeed={() => {}}
        onDismiss={() => {}}
        onLoadSample={() => {}}
      />
    </div>
  ),
};

export const PartiallyComplete: Story = {
  render: () => (
    <div style={{ maxWidth: "20rem" }}>
      <OnboardingChecklist
        profileDone={true}
        companyDone={true}
        jobDone={false}
        feedDone={false}
        onGoToProfile={() => {}}
        onGoToCompanies={() => {}}
        onAddJob={() => {}}
        onGoToFeed={() => {}}
        onDismiss={() => {}}
        onLoadSample={() => {}}
      />
    </div>
  ),
};
