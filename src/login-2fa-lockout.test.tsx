import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import "./i18n";

// Lose the authenticator and the backup codes and this screen was a dead end.
// The reset exists — POST /api/admin/users/:id/reset-2fa — but it is admin-only
// and nothing on the page said so, so the form went on asking for a code the
// person could not produce and offered no other move. Backup codes are the
// self-serve path and they are genuinely good; this is for the case where both
// are gone.
const signInEmail = vi.fn(async () => ({
  data: { twoFactorRedirect: true },
  error: null,
}));

vi.mock("./auth-client", () => ({
  signIn: { email: (...a: unknown[]) => signInEmail(...(a as [])) },
  authClient: { twoFactor: { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() } },
}));

const { Login } = await import("./Login");

async function reachTwoFactorStep() {
  render(<Login />);
  fireEvent.change(screen.getByLabelText(/e-?mail/i), {
    target: { value: "somebody@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/password|wachtwoord/i), {
    target: { value: "correct-horse" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: /two-factor code/i })).toBeTruthy(),
  );
}

describe("the two-factor screen when both factors are gone", () => {
  test("keeps the ordinary path free of it", async () => {
    await reachTwoFactorStep();
    // Someone with their phone in hand is not locked out and should not be
    // told about resets.
    expect(screen.queryByText(/administrator can reset/i)).toBeNull();
  });

  test("names the way out once the backup codes are the last resort", async () => {
    await reachTwoFactorStep();
    fireEvent.click(screen.getByRole("button", { name: /use a backup code/i }));
    expect(
      screen.getByText(/administrator can reset two-factor authentication/i),
      "a person out of backup codes is given no next move",
    ).toBeTruthy();
  });

  test("promises no address it cannot know", async () => {
    // There is no configured operator contact to read one from, and a wrong
    // address is worse than a true sentence about who can help.
    await reachTwoFactorStep();
    fireEvent.click(screen.getByRole("button", { name: /use a backup code/i }));
    const text = screen.getByText(/administrator can reset/i).textContent ?? "";
    expect(text, "the copy invents a contact address").not.toMatch(/@|mailto:/);
  });
});
