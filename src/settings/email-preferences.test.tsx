import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { NotificationSettings } from "./notifications";
// Side-effect: initializes i18next so `t()` renders real copy instead of raw
// keys (same convention as timezone-field.test.tsx).
import "../i18n";

// jsdom has neither `serviceWorker` nor `PushManager`, so NotificationSettings'
// `supported` is always false here — which conveniently doubles as the
// regression check for the trap this task called out: the email block must
// not depend on push support, so it has to render in this environment too.
vi.mock("../api", () => ({
  api: {
    getPreferences: vi.fn(),
    setEmailPreferences: vi.fn(),
  },
}));

describe("email preference toggles", () => {
  afterEach(() => {
    vi.mocked(api.getPreferences).mockReset();
    vi.mocked(api.setEmailPreferences).mockReset();
  });

  it("render both checkboxes from the fetched preferences", async () => {
    vi.mocked(api.getPreferences).mockResolvedValue({
      locale: "en",
      timezone: "UTC",
      emailReminders: true,
      emailDigest: false,
    });
    render(<NotificationSettings />);

    const reminders = await screen.findByRole("checkbox", {
      name: "Follow-up reminders",
    });
    const digest = screen.getByRole("checkbox", { name: "Weekly digest" });
    expect(reminders).toBeChecked();
    expect(digest).not.toBeChecked();
  });

  it("renders the email block even though this environment has no push support", async () => {
    vi.mocked(api.getPreferences).mockResolvedValue({
      locale: "en",
      timezone: "UTC",
      emailReminders: false,
      emailDigest: false,
    });
    render(<NotificationSettings />);

    expect(await screen.findByText("Email")).toBeInTheDocument();
    // The push section is gated on `supported`, which is false in jsdom —
    // confirming the two are siblings, not nested under the same guard.
    expect(screen.queryByText("Push notifications")).not.toBeInTheDocument();
  });

  it("sends only the changed key when toggling reminders, and updates optimistically", async () => {
    vi.mocked(api.getPreferences).mockResolvedValue({
      locale: "en",
      timezone: "UTC",
      emailReminders: false,
      emailDigest: false,
    });
    // Never resolves — proves the checkbox flips before any request settles.
    vi.mocked(api.setEmailPreferences).mockReturnValue(new Promise(() => {}));
    render(<NotificationSettings />);

    const reminders = await screen.findByRole("checkbox", {
      name: "Follow-up reminders",
    });
    fireEvent.click(reminders);

    expect(reminders).toBeChecked();
    expect(api.setEmailPreferences).toHaveBeenCalledExactlyOnceWith({
      emailReminders: true,
    });
  });

  it("sends only the changed key when toggling the digest", async () => {
    vi.mocked(api.getPreferences).mockResolvedValue({
      locale: "en",
      timezone: "UTC",
      emailReminders: true,
      emailDigest: true,
    });
    vi.mocked(api.setEmailPreferences).mockReturnValue(new Promise(() => {}));
    render(<NotificationSettings />);

    const digest = await screen.findByRole("checkbox", {
      name: "Weekly digest",
    });
    fireEvent.click(digest);

    expect(digest).not.toBeChecked();
    expect(api.setEmailPreferences).toHaveBeenCalledExactlyOnceWith({
      emailDigest: false,
    });
  });
});
