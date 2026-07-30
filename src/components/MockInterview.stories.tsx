import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { MockInterview } from "./MockInterview";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const meta: Meta<typeof MockInterview> = {
  title: "AI/MockInterview",
  component: MockInterview,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof MockInterview>;

const props = {
  title: "Staff Engineer",
  company: "Acme Corp",
  jobDescription: null,
  onError: () => {},
};

// Before the candidate starts: just the hint and the start control. The
// transcript log only exists once a turn has run.
export const BeforeStart: Story = {
  args: props,
};

// A couple of exchanges in — the transcript log with assistant and user
// bubbles. There is no prop to seed messages directly (the component owns
// its own state and talks to the API itself), so the play function stubs
// fetch and drives one real turn, the same way a candidate would; delay:
// null keeps every step synchronous so the capture harness's fixed-network
// wait always lands after the interaction, not mid-flight.
export const InProgress: Story = {
  args: props,
  play: async ({ canvasElement }) => {
    const replies = [
      "Tell me about a time you disagreed with a teammate about a technical decision.",
      "Good — what would you do differently next time?",
    ];
    let call = 0;
    const originalFetch = window.fetch;
    window.fetch = (async () =>
      new Response(
        JSON.stringify({ reply: replies[Math.min(call++, replies.length - 1)] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof window.fetch;

    try {
      const user = userEvent.setup({ delay: null });
      const canvas = within(canvasElement);

      await user.click(canvas.getByRole("button", { name: /start interview/i }));
      await canvas.findByText(replies[0]);

      await user.type(
        canvas.getByPlaceholderText(/type your answer/i),
        "I once disagreed with a teammate about a caching strategy; we resolved it with a quick prototype.",
      );
      await user.click(canvas.getByRole("button", { name: /^send$/i }));
      await canvas.findByText(replies[1]);
    } finally {
      window.fetch = originalFetch;
    }
  },
};
