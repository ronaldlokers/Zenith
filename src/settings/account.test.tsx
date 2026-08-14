import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// settings/account.tsx was 147 statements at 7.5%, and every action in it is
// irreversible: delete the account, change the password, turn 2FA off, and
// discard the only codes that get you back in.

const enable = vi.fn();
const disable = vi.fn();
const verifyTotp = vi.fn();

vi.mock("../auth-client", () => ({
  authClient: {
    twoFactor: {
      enable: (...a: unknown[]) => enable(...a),
      disable: (...a: unknown[]) => disable(...a),
      verifyTotp: (...a: unknown[]) => verifyTotp(...a),
    },
    changePassword: vi.fn(),
  },
  signOut: vi.fn(),
  useSession: () => ({
    data: { user: { email: "alex@example.com", twoFactorEnabled: false } },
  }),
}));

const { TwoFactorSettings } = await import("./account");

const CODES = ["aaaa-1111", "bbbb-2222", "cccc-3333"];

async function reachTheCodes() {
  enable.mockResolvedValue({
    data: {
      totpURI: "otpauth://totp/Zenith:alex?secret=JBSWY3DPEHPK3PXP&issuer=Zenith",
      backupCodes: CODES,
    },
    error: null,
  });
  const user = userEvent.setup();
  render(<TwoFactorSettings />);
  await user.type(screen.getByLabelText(/password/i), "hunter2");
  await user.click(screen.getByRole("button", { name: /enable/i }));
  expect(await screen.findByText(CODES[0])).toBeInTheDocument();
  return user;
}

describe("the backup codes shown when 2FA is set up", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cannot be dismissed until the person says they saved them", async () => {
    // The defect: Close was one click next to the codes, and there is no
    // route in the app to see them again. Login.tsx accepts a backup code in
    // place of a TOTP code, so this is the only way back into an account
    // whose authenticator is gone.
    await reachTheCodes();
    expect(
      screen.getByRole("button", { name: /close/i }),
      "the only recovery path can be discarded by reflex",
    ).toBeDisabled();
  });

  it("closes once they have", async () => {
    const user = await reachTheCodes();
    await user.click(screen.getByRole("checkbox"));
    const close = screen.getByRole("button", { name: /close/i });
    expect(close).toBeEnabled();
    await user.click(close);
    expect(screen.queryByText(CODES[0])).not.toBeInTheDocument();
  });

  it("says plainly that they will not be shown again", async () => {
    await reachTheCodes();
    expect(screen.getByText(/cannot show them again/i)).toBeInTheDocument();
  });

  it("offers every code for download, not just the ones on screen", async () => {
    // The download is the realistic way anyone keeps these. If it ever writes
    // a subset, the codes people file away stop matching the account.
    const user = await reachTheCodes();
    let written = "";
    const realBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class extends realBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          written = parts.join("");
        }
      },
    );
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:x",
      revokeObjectURL: () => {},
    });
    await user.click(screen.getByRole("button", { name: /download/i }));
    for (const code of CODES) expect(written).toContain(code);
    vi.unstubAllGlobals();
  });
});

describe("turning 2FA off", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the account password", async () => {
    // Without this, anyone with a borrowed session can drop the second factor.
    disable.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<TwoFactorSettings />);
    const password = screen.getByLabelText(/password/i) as HTMLInputElement;
    expect(password).toBeRequired();
    expect(password.type).toBe("password");
    await user.type(password, "hunter2");
    await user.click(screen.getByRole("button", { name: /enable|disable/i }));
    const call = (enable.mock.calls[0] ?? disable.mock.calls[0])?.[0] as {
      password?: string;
    };
    expect(call?.password).toBe("hunter2");
  });
});
