import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, test, vi } from "vitest";
import { BACKUP_RETENTION_DAYS } from "../backup-policy";
import "../i18n";

vi.mock("../api", () => ({ api: { deleteAccount: () => Promise.resolve() } }));
vi.mock("../auth-client", () => ({
  signOut: () => Promise.resolve(),
  authClient: {},
  useSession: () => ({ data: { user: { email: "jordan@example.com" } } }),
}));
vi.mock("../ai-status-context", () => ({ useAiStatus: () => ({}) }));

const { DeleteAccount } = await import("./account");

// "Permanently deletes your account and all your data" was not quite true.
// runScheduledBackup dumps every table into R2 nightly and keeps the last
// fourteen, so a deleted account's rows — and the contact details of third
// parties who never used Zenith — survive there until they age out.
//
// That is ordinary disaster-recovery practice and worth keeping. What is not
// ordinary is promising erasure that has not happened yet, at the exact moment
// someone is asking for it.
//
// The number is not repeated in the copy. It is interpolated from the same
// constant the pruning uses, so the promise cannot drift from the policy.
function openConfirm() {
  render(<DeleteAccount onError={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
}

describe("the delete-account confirmation", () => {
  test("says how long a copy can survive in backups", () => {
    openConfirm();
    const note = screen.getByText(/backup/i);
    expect(
      note.textContent,
      "the dialog promises erasure without mentioning backups at all",
    ).toMatch(new RegExp(String(BACKUP_RETENTION_DAYS)));
  });

  test("does not make the reader hunt for it after the fact", () => {
    // Beside the export offer, in the dialog — not in a doc they would have to
    // know existed.
    openConfirm();
    expect(screen.getByText(/backup/i)).toBeTruthy();
  });
});
