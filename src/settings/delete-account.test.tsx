import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "../i18n";

// Deleting the account is the only action in Zenith that destroys
// everything — every application, document, contact and CV — and it used to
// be guarded by the shared OK/Cancel confirm, which is dismissed by the same
// reflex that dismisses every other OK button.
//
// The guard is now a typed confirmation, so the guard is what gets tested:
// the button must be unreachable until the account's own email is typed
// back. A test that only checked "a dialog appears" would pass with the
// delete button live from the first frame.
const deleteAccount = vi.fn(() => Promise.resolve());
const signOut = vi.fn(() => Promise.resolve());

vi.mock("../api", () => ({ api: { deleteAccount: () => deleteAccount() } }));
vi.mock("../auth-client", () => ({
  signOut: () => signOut(),
  authClient: {},
  useSession: () => ({ data: { user: { email: "jordan@example.com" } } }),
}));
vi.mock("../ai-status-context", () => ({ useAiStatus: () => ({}) }));

const { DeleteAccount } = await import("./account");

const openDialog = () => {
  render(<DeleteAccount onError={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  return screen.getByRole("button", { name: "Delete my account" });
};

describe("delete account", () => {
  beforeEach(() => {
    deleteAccount.mockClear();
    signOut.mockClear();
  });

  test("will not delete until the email is typed back", () => {
    const confirm = openDialog();
    expect(confirm).toBeDisabled();

    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "jordan@exampl" } });
    expect(confirm, "a prefix is not the address").toBeDisabled();

    fireEvent.change(field, { target: { value: "someone@else.com" } });
    expect(confirm, "another valid address is not this one").toBeDisabled();

    fireEvent.change(field, { target: { value: "jordan@example.com" } });
    expect(confirm).toBeEnabled();
  });

  test("accepts the address in any case, with surrounding space", () => {
    // Typed by hand under stress, and often auto-capitalized by a phone
    // keyboard. Rejecting "Jordan@Example.com" would teach nothing about
    // consequence and only punish the typing.
    const confirm = openDialog();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Jordan@Example.COM " },
    });
    expect(confirm).toBeEnabled();
  });

  test("sends nothing while the field is wrong", () => {
    const confirm = openDialog();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "nope@example.com" },
    });
    fireEvent.click(confirm);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  test("names what is destroyed, and offers the export instead", () => {
    // A confirmation that only asks "are you sure?" tells the person
    // nothing they did not already know. The way out that is not deletion
    // belongs here too — this is the moment someone realises they wanted
    // their data, not the settings section they would have to go find.
    openDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/applications, companies, contacts/i);
    expect(dialog.textContent).toMatch(/export/i);
  });
});
