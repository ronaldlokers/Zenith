import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicApiSettings } from "./api";
import { api } from "../api";
import * as hooks from "../hooks";

// The API-key panel reported every failure except the one that loads the
// key's own status. keyHint === null meant both "you have no key" and "we
// could not ask", and the panel rendered both as the first.

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "webhooks").mockResolvedValue([]);
});

describe("when the key's status cannot be loaded", () => {
  it("says so rather than claiming there is no key", async () => {
    // The panel rendered "Generate API key" — a statement about someone's
    // account, made from a request that failed.
    vi.spyOn(api, "profile").mockRejectedValue(new Error("network"));
    const onError = vi.fn();
    render(<PublicApiSettings onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith("network"));
    expect(screen.getByText(/could not check/i)).toBeInTheDocument();
  });

  it("still warns before replacing a key it could not see", async () => {
    // The chain that made this worth fixing: a failed read left keyHint null,
    // null read as "no key", and "no key" skipped the warning — so a request
    // that failed silently removed the guard on revoking a live key and
    // breaking whatever was authenticating with it.
    vi.spyOn(api, "profile").mockRejectedValue(new Error("network"));
    const confirm = vi.spyOn(hooks, "requestConfirm").mockResolvedValue(false);
    const generate = vi.spyOn(api, "generateApiKey");
    const user = userEvent.setup();
    render(<PublicApiSettings onError={vi.fn()} />);
    await screen.findByText(/could not check/i);

    await user.click(screen.getByRole("button", { name: /generate/i }));
    expect(confirm, "a key that might exist was replaced without asking").toHaveBeenCalled();
    expect(generate, "declining the warning still replaced the key").not.toHaveBeenCalled();
  });
});

describe("when the status is known", () => {
  it("offers a plain generate with no warning if there is no key", async () => {
    // The other direction: the first-time generate has nothing to break, and
    // a warning there would be friction spent for nothing.
    vi.spyOn(api, "profile").mockResolvedValue({
      api_key_hint: null,
      api_key_created_at: null,
    } as never);
    const confirm = vi.spyOn(hooks, "requestConfirm").mockResolvedValue(true);
    vi.spyOn(api, "generateApiKey").mockResolvedValue({ api_key: "zk_abcd1234" } as never);
    const user = userEvent.setup();
    render(<PublicApiSettings onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /generate/i }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("warns before replacing a key that exists", async () => {
    vi.spyOn(api, "profile").mockResolvedValue({
      api_key_hint: "1234",
      api_key_created_at: "2026-01-01",
    } as never);
    const confirm = vi.spyOn(hooks, "requestConfirm").mockResolvedValue(false);
    const generate = vi.spyOn(api, "generateApiKey");
    const user = userEvent.setup();
    render(<PublicApiSettings onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /regenerate/i }));
    expect(confirm).toHaveBeenCalled();
    expect(generate, "declining the warning still replaced the key").not.toHaveBeenCalled();
  });
});
