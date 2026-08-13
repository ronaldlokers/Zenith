import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import "./i18n";

// A failed sign-in used to leave keyboard focus on <body>. The submit button
// is disabled while the request is in flight, and a focused element that
// becomes disabled drops focus to the document — so after a wrong password
// the user was at the top of the page, on the one screen with no way around
// a dead end, and had to Tab back into the form to try again.
//
// The button is what gets clicked, so the button is what the test clicks:
// asserting on a programmatic submit would never disable a focused element.
//
// One honest caveat about what this can and cannot prove. jsdom does not
// implement the browser behaviour that causes the bug — disabling a focused
// element there leaves focus where it is — so removing the fix leaves focus
// on the *button*, not on <body>. The "not body" assertion below is
// therefore belt-and-braces in this environment; the assertion that actually
// catches a regression is the one naming the email field. The <body>
// behaviour was measured in a real browser: document.activeElement was BODY
// after every failed sign-in, by click and by Enter alike.
const signInEmail = vi.fn(async () => ({
  data: null,
  error: { message: "invalid" },
}));

vi.mock("./auth-client", () => ({
  signIn: { email: (...a: unknown[]) => signInEmail(...(a as [])) },
  authClient: { twoFactor: { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() } },
}));

const { Login } = await import("./Login");

describe("failed sign-in", () => {
  test("returns focus to a field instead of dropping it on the document", async () => {
    render(<Login />);
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password|wachtwoord/i), {
      target: { value: "wrong" },
    });

    const button = screen.getByRole("button", { name: /sign in/i });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(document.activeElement).not.toBe(document.body);
    expect(
      document.activeElement,
      "focus must land on the field to correct, not stay on the button " +
        "(which a real browser disables, dropping focus to the document)",
    ).toBe(screen.getByLabelText(/e-?mail/i));
  });

  test("ties the invalid fields to the message that explains them", async () => {
    // aria-invalid said the field was wrong; nothing said why. The alert
    // announces once when it appears, but a user who comes back to the field
    // afterwards got "invalid" and no explanation.
    render(<Login />);
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password|wachtwoord/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const alert = screen.getByRole("alert");
    for (const field of [
      screen.getByLabelText(/e-?mail/i),
      screen.getByLabelText(/password|wachtwoord/i),
    ]) {
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(field.getAttribute("aria-describedby")).toBe(alert.id);
      expect(alert.id, "the message needs an id to be referenced by").toBeTruthy();
    }
  });
});
