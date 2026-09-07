import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../i18n";
import { AnthropicKeySettings } from "./account";

// The AI panel said what each feature sends and that the key is stored
// encrypted, but never that the money is the user's. For a bring-your-own-key
// feature that is the one fact they cannot learn from inside the app: Zenith
// never sees the bill, so without being told where to look, the first signal
// is a charge they did not expect.
vi.mock("../api", () => ({
  api: {
    aiKeyStatus: () => Promise.resolve({ configured: false, hint: null }),
    setAnthropicKey: () => Promise.resolve(undefined),
    clearAnthropicKey: () => Promise.resolve(undefined),
  },
}));

describe("the AI key panel's cost disclosure", () => {
  it("says whose account is billed", async () => {
    render(<AnthropicKeySettings />);
    expect(
      await screen.findByText(/billed to your own Anthropic account/i),
    ).toBeInTheDocument();
  });

  it("points at the console, where the figure actually lives", async () => {
    // Zenith does not record per-call usage, so it cannot show a running
    // total — the link is the whole answer to "what have I spent", and a
    // disclosure without it just says "you are paying" and stops.
    render(<AnthropicKeySettings />);
    const usage = await screen.findByRole("link", { name: /usage/i });
    expect(usage).toHaveAttribute("href", "https://console.anthropic.com/settings/usage");
    const pricing = screen.getByRole("link", { name: /pricing|tarieven/i });
    expect(pricing).toHaveAttribute("href", "https://www.anthropic.com/pricing");
  });
});
