import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { NotificationSettings } from "./notifications";
// Side-effect: initializes i18next so `t()` renders real copy instead of raw
// keys (same convention as timezone-field.test.tsx).
import "../i18n";

// `supported` is computed once, from `"serviceWorker" in navigator &&
// "PushManager" in window` — both absent in jsdom (see
// email-preferences.test.tsx), so this file stubs them in to reach the push
// block at all. subscribe() reads its registration and key from refs set by
// the mount effect (Promise.all of serviceWorker.ready + api.pushPublicKey),
// so every test resolves those before clicking Enable.
vi.mock("../api", () => ({
  api: {
    getPreferences: vi.fn(),
    setEmailPreferences: vi.fn(),
    pushPublicKey: vi.fn(),
    pushSubscribe: vi.fn(),
  },
}));

function mockSubscribe(
  impl: () => Promise<{ toJSON: () => object }>,
): ServiceWorkerRegistration {
  const reg = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn(impl),
    },
  };
  return reg as unknown as ServiceWorkerRegistration;
}

describe("push subscribe error branching", () => {
  beforeEach(() => {
    vi.mocked(api.getPreferences).mockResolvedValue({
      locale: "en",
      timezone: "UTC",
      emailReminders: false,
      emailDigest: false,
    });
    vi.mocked(api.pushPublicKey).mockResolvedValue({ publicKey: "abc" });
    vi.stubGlobal("PushManager", class {});
  });

  afterEach(() => {
    vi.mocked(api.getPreferences).mockReset();
    vi.mocked(api.pushPublicKey).mockReset();
    vi.mocked(api.pushSubscribe).mockReset();
    vi.unstubAllGlobals();
  });

  it("shows the permission copy when the browser refuses the prompt", async () => {
    // What a browser actually throws for a denied permission: the Push API
    // spec has PushManager.subscribe() reject with a DOMException named
    // "NotAllowedError" (MDN documents the same for Chrome/Firefox), so the
    // fixture is a real DOMException with that name, not a plain Error —
    // a plain Error would pass the branch check without proving it reads
    // `.name` off a DOMException the way the real rejection does.
    const reg = mockSubscribe(() =>
      Promise.reject(new DOMException("denied", "NotAllowedError")),
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { ready: Promise.resolve(reg) },
    });
    render(<NotificationSettings />);

    const button = await screen.findByRole("button", {
      name: "Enable push notifications",
    });
    fireEvent.click(button);

    expect(
      await screen.findByText(
        "Couldn't do that — check your browser's notification permission.",
      ),
    ).toBeInTheDocument();
    expect(api.pushSubscribe).not.toHaveBeenCalled();
  });

  it("shows the registration copy for a non-permission subscribe failure", async () => {
    const reg = mockSubscribe(() =>
      Promise.reject(new DOMException("push service unreachable", "AbortError")),
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { ready: Promise.resolve(reg) },
    });
    render(<NotificationSettings />);

    const button = await screen.findByRole("button", {
      name: "Enable push notifications",
    });
    fireEvent.click(button);

    expect(
      await screen.findByText(
        "Your browser couldn't register for notifications. If it keeps happening, try again in a few minutes.",
      ),
    ).toBeInTheDocument();
    expect(api.pushSubscribe).not.toHaveBeenCalled();
  });

  it("shows the server's own message when the subscribe call to the api fails", async () => {
    const reg = mockSubscribe(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: "https://push/1" }) }),
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { ready: Promise.resolve(reg) },
    });
    vi.mocked(api.pushSubscribe).mockRejectedValue(
      new Error("Your session has expired. Sign in again."),
    );
    render(<NotificationSettings />);

    const button = await screen.findByRole("button", {
      name: "Enable push notifications",
    });
    fireEvent.click(button);

    // Neither of the component's own strings — the message request() in
    // api.ts already produced.
    expect(
      await screen.findByText("Your session has expired. Sign in again."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Couldn't do that — check your browser's notification permission.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Your browser couldn't register for notifications. If it keeps happening, try again in a few minutes.",
      ),
    ).not.toBeInTheDocument();
  });
});
